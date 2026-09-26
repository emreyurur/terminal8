import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { Horizon } from "@stellar/stellar-sdk";
import { appConfig } from "../../config/app.config";
import { HistoryService } from "../history/history.service";
import {
  AlertMetric,
  PoolSnapshot,
  QuoteSide,
  describeAlert,
  formatValue,
  impermanentLossPct,
  isTriggered,
  poolPrice,
  positionValue,
} from "./alert-metrics";
import { AlertNotification } from "./entities/alert-notification.entity";
import { PriceAlert } from "./entities/price-alert.entity";
import { CreateAlertDto, UpdateAlertDto } from "./dto/alert.dto";
import { EmailService } from "./email.service";

const assetCode = (asset: string) =>
  asset === "native" ? "XLM" : asset.split(":")[0];

/** Per evaluation run: avoids asking Horizon twice for the same pool or wallet. */
interface RunCache {
  pools: Map<string, PoolSnapshot | null>;
  shares: Map<string, Map<string, number> | null>;
}

@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>,
    @InjectRepository(PriceAlert)
    private readonly alerts: Repository<PriceAlert>,
    @InjectRepository(AlertNotification)
    private readonly notifications: Repository<AlertNotification>,
    private readonly history: HistoryService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    if (!this.config.alertsEnabled) {
      this.logger.log("Alert evaluation is disabled (ALERTS_ENABLED=false)");
      return;
    }
    this.timer = setInterval(
      () => void this.evaluateAll(),
      this.config.alertCheckIntervalMs,
    );
    this.timer.unref();
    this.logger.log(
      `Alert evaluation every ${this.config.alertCheckIntervalMs}ms`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  getConfig() {
    return {
      emailEnabled: this.email.enabled,
      maxAlerts: this.config.maxAlertsPerUser,
      checkIntervalMs: this.config.alertCheckIntervalMs,
    };
  }

  // ─── Live data (overridable in tests) ────────────────────────────────────────

  protected horizon(): Horizon.Server {
    return new Horizon.Server(this.config.horizonUrl);
  }

  protected async fetchPool(poolId: string): Promise<PoolSnapshot | null> {
    try {
      const pool = await this.horizon()
        .liquidityPools()
        .liquidityPoolId(poolId)
        .call();
      if (pool.reserves.length !== 2) return null;
      return {
        reserveA: Number(pool.reserves[0].amount),
        reserveB: Number(pool.reserves[1].amount),
        totalShares: Number(pool.total_shares),
        codeA: assetCode(pool.reserves[0].asset),
        codeB: assetCode(pool.reserves[1].asset),
      };
    } catch {
      return null;
    }
  }

  /** LP share balance per pool id for a wallet, null when the account cannot be read. */
  protected async fetchShares(
    publicKey: string,
  ): Promise<Map<string, number> | null> {
    try {
      const account = await this.horizon().loadAccount(publicKey);
      const out = new Map<string, number>();
      for (const b of account.balances as any[]) {
        if (b.liquidity_pool_id)
          out.set(b.liquidity_pool_id, Number(b.balance));
      }
      return out;
    } catch {
      return null;
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  list(userPublicKey: string) {
    return this.alerts.find({
      where: { userPublicKey },
      order: { createdAt: "DESC" },
    });
  }

  async create(userPublicKey: string, dto: CreateAlertDto) {
    if (dto.metric === "IMPERMANENT_LOSS_PCT" && dto.condition !== "ABOVE") {
      throw new BadRequestException(
        "Impermanent loss alerts can only trigger when it rises above a value",
      );
    }
    if (!dto.notifyBrowser && !dto.notifyEmail) {
      throw new BadRequestException("Pick at least one notification channel");
    }
    if (dto.notifyEmail && !this.email.enabled) {
      throw new BadRequestException(
        "Email alerts are not configured on this server",
      );
    }
    if (
      (await this.alerts.count({ where: { userPublicKey } })) >=
      this.config.maxAlertsPerUser
    ) {
      throw new BadRequestException(
        `You can have at most ${this.config.maxAlertsPerUser} alerts`,
      );
    }

    const pool = await this.fetchPool(dto.poolId);
    if (!pool) throw new BadRequestException("Pool not found");

    const alert = this.alerts.create({
      userPublicKey,
      poolId: dto.poolId.toLowerCase(),
      codeA: pool.codeA,
      codeB: pool.codeB,
      metric: dto.metric,
      condition: dto.condition,
      threshold: dto.threshold,
      quoteSide: dto.quoteSide ?? "A",
      notifyBrowser: dto.notifyBrowser,
      notifyEmail: dto.notifyEmail,
      email: dto.notifyEmail ? dto.email! : null,
      status: "ACTIVE",
    });
    return this.alerts.save(alert);
  }

  async update(userPublicKey: string, id: string, dto: UpdateAlertDto) {
    const alert = await this.owned(userPublicKey, id);
    const next = { ...alert, ...this.definedOnly(dto) } as PriceAlert;

    if (next.metric === "IMPERMANENT_LOSS_PCT" && next.condition !== "ABOVE") {
      throw new BadRequestException(
        "Impermanent loss alerts can only trigger when it rises above a value",
      );
    }
    if (!next.notifyBrowser && !next.notifyEmail) {
      throw new BadRequestException("Pick at least one notification channel");
    }
    if (next.notifyEmail && (!next.email || !this.email.enabled)) {
      throw new BadRequestException(
        this.email.enabled
          ? "An email address is required"
          : "Email alerts are not configured on this server",
      );
    }

    // Re-arming (or changing what is watched) starts a fresh cycle.
    const rearm =
      dto.status === "ACTIVE" ||
      dto.threshold !== undefined ||
      dto.condition !== undefined;
    if (rearm && next.status === "TRIGGERED") next.status = "ACTIVE";
    if (rearm) {
      next.triggeredAt = null;
      next.triggeredValue = null;
      next.emailStatus = null;
    }
    return this.alerts.save(next);
  }

  async remove(userPublicKey: string, id: string) {
    const alert = await this.owned(userPublicKey, id);
    await this.notifications.delete({ alertId: alert.id });
    await this.alerts.delete({ id: alert.id });
    return { deleted: true };
  }

  private async owned(userPublicKey: string, id: string): Promise<PriceAlert> {
    const alert = await this.alerts.findOne({ where: { id, userPublicKey } });
    if (!alert) throw new NotFoundException("Alert not found");
    return alert;
  }

  private definedOnly<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
  }

  // ─── Notifications inbox ─────────────────────────────────────────────────────

  listNotifications(userPublicKey: string, unreadOnly: boolean) {
    return this.notifications.find({
      where: unreadOnly
        ? { userPublicKey, readAt: IsNull() }
        : { userPublicKey },
      order: { createdAt: "DESC" },
      take: 50,
    });
  }

  async markRead(userPublicKey: string, ids?: number[]) {
    const where =
      ids && ids.length > 0
        ? { userPublicKey, id: In(ids), readAt: IsNull() }
        : { userPublicKey, readAt: IsNull() };
    const res = await this.notifications.update(where, { readAt: new Date() });
    return { updated: res.affected ?? 0 };
  }

  // ─── Current value (for the create form) ─────────────────────────────────────

  async currentValue(
    userPublicKey: string,
    poolId: string,
    metric: AlertMetric,
    quoteSide: QuoteSide = "A",
  ) {
    const cache = this.newCache();
    const pool = await this.poolFor(cache, poolId);
    if (!pool) throw new BadRequestException("Pool not found");
    const value = await this.computeValue(
      cache,
      { userPublicKey, poolId, metric, quoteSide },
      pool,
    );
    return { value, codeA: pool.codeA, codeB: pool.codeB };
  }

  // ─── Evaluation ──────────────────────────────────────────────────────────────

  private newCache(): RunCache {
    return { pools: new Map(), shares: new Map() };
  }

  private async poolFor(cache: RunCache, poolId: string) {
    if (!cache.pools.has(poolId))
      cache.pools.set(poolId, await this.fetchPool(poolId));
    return cache.pools.get(poolId)!;
  }

  private async computeValue(
    cache: RunCache,
    a: Pick<PriceAlert, "userPublicKey" | "poolId" | "metric" | "quoteSide">,
    pool: PoolSnapshot,
  ): Promise<number | null> {
    if (a.metric === "PRICE") return poolPrice(pool, a.quoteSide);

    if (!cache.shares.has(a.userPublicKey)) {
      cache.shares.set(
        a.userPublicKey,
        await this.fetchShares(a.userPublicKey),
      );
    }
    const shares = cache.shares.get(a.userPublicKey)?.get(a.poolId) ?? 0;
    if (!(shares > 0)) return null;

    if (a.metric === "POSITION_VALUE")
      return positionValue(pool, shares, a.quoteSide);

    const basis = await this.history.calculateUserCostBasis(
      a.userPublicKey,
      a.poolId,
    );
    return impermanentLossPct(
      pool,
      shares,
      Number(basis.costBasisA),
      Number(basis.costBasisB),
    );
  }

  /** One pass over all active alerts. Safe to call concurrently: a run in progress makes this a no-op. */
  async evaluateAll(): Promise<{ checked: number; triggered: number }> {
    if (this.running) return { checked: 0, triggered: 0 };
    this.running = true;
    let checked = 0;
    let triggered = 0;

    try {
      const active = await this.alerts.find({ where: { status: "ACTIVE" } });
      const cache = this.newCache();

      for (const alert of active) {
        try {
          const pool = await this.poolFor(cache, alert.poolId);
          if (!pool) continue;
          const value = await this.computeValue(cache, alert, pool);
          if (value === null) continue;
          checked++;

          if (isTriggered(value, alert.condition, alert.threshold)) {
            if (await this.fire(alert, pool, value)) triggered++;
          } else {
            await this.alerts.update(
              { id: alert.id },
              { lastValue: value, lastCheckedAt: new Date() },
            );
          }
        } catch (e) {
          this.logger.error(`Alert ${alert.id} check failed: ${e.message}`);
        }
      }
    } finally {
      this.running = false;
    }
    return { checked, triggered };
  }

  private async fire(
    alert: PriceAlert,
    pool: PoolSnapshot,
    value: number,
  ): Promise<boolean> {
    // Claim the alert first. With more than one API instance only the one whose update matches sends anything.
    const claim = await this.alerts.update(
      { id: alert.id, status: "ACTIVE" },
      {
        status: "TRIGGERED",
        triggeredAt: new Date(),
        triggeredValue: value,
        lastValue: value,
        lastCheckedAt: new Date(),
      },
    );
    if (!claim.affected) return false;

    const message = describeAlert({
      ...alert,
      codeA: pool.codeA,
      codeB: pool.codeB,
    });
    const shown = formatValue(
      alert.metric,
      value,
      pool.codeA,
      pool.codeB,
      alert.quoteSide,
    );

    await this.notifications.save(
      this.notifications.create({
        userPublicKey: alert.userPublicKey,
        alertId: alert.id,
        message: `${message} (now ${shown})`,
        value,
        popup: alert.notifyBrowser,
      }),
    );

    if (alert.notifyEmail && alert.email) {
      const ok = await this.email.sendAlert(
        alert.email,
        `Terminal8 alert: ${message}`,
        message,
        [
          `Current value: ${shown}`,
          `Pool: ${pool.codeA}/${pool.codeB} (${alert.poolId})`,
        ],
      );
      await this.alerts.update(
        { id: alert.id },
        { emailStatus: ok ? "SENT" : "FAILED" },
      );
    }
    this.logger.log(`Alert ${alert.id} triggered: ${message} (${shown})`);
    return true;
  }
}
