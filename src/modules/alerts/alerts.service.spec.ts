import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { PoolSnapshot } from "./alert-metrics";

const USER = "G".padEnd(56, "A");
const POOL = "a".repeat(64);

/** In-memory stand-in for a TypeORM repository, just enough for the service. */
class FakeRepo<T extends { id: any }> {
  rows: T[] = [];
  private seq = 1;
  create = (data: Partial<T>) => ({ ...data }) as T;
  save = async (row: T) => {
    if (row.id === undefined)
      (row as any).id = (this as any).uuid ? `id-${this.seq++}` : this.seq++;
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = row;
    else this.rows.push(row);
    return row;
  };
  private matches(row: any, where: any) {
    return Object.entries(where).every(([k, v]: [string, any]) => {
      if (v && typeof v === "object" && "_type" in v) {
        if (v._type === "isNull")
          return row[k] === null || row[k] === undefined;
        if (v._type === "in") return v._value.includes(row[k]);
      }
      return row[k] === v;
    });
  }
  find = async (opts: any = {}) =>
    this.rows
      .filter((r) => this.matches(r, opts.where ?? {}))
      .map((r) => ({ ...r }));
  findOne = async (opts: any) => {
    const r = this.rows.find((x) => this.matches(x, opts.where));
    return r ? { ...r } : null;
  };
  count = async (opts: any) =>
    this.rows.filter((r) => this.matches(r, opts.where ?? {})).length;
  update = async (where: any, patch: any) => {
    let affected = 0;
    for (const r of this.rows)
      if (this.matches(r, where)) (Object.assign(r, patch), affected++);
    return { affected };
  };
  delete = async (where: any) => {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !this.matches(r, where));
    return { affected: before - this.rows.length };
  };
}

const config: any = {
  horizonUrl: "https://horizon.test",
  alertsEnabled: false,
  alertCheckIntervalMs: 60000,
  maxAlertsPerUser: 2,
};

function setup(
  opts: {
    emailEnabled?: boolean;
    pool?: PoolSnapshot | null;
    shares?: number;
  } = {},
) {
  const alerts = new FakeRepo<any>();
  (alerts as any).uuid = true;
  const notifications = new FakeRepo<any>();
  const sent: any[] = [];
  const email: any = {
    enabled: opts.emailEnabled ?? true,
    sendAlert: jest.fn(async (...args: any[]) => (sent.push(args), true)),
  };
  const history: any = {
    calculateUserCostBasis: jest.fn(async () => ({
      costBasisA: "100",
      costBasisB: "400",
    })),
  };

  const service = new AlertsService(
    config,
    alerts as any,
    notifications as any,
    history,
    email,
  );
  const state = {
    pool: (opts.pool === undefined
      ? {
          reserveA: 1000,
          reserveB: 4000,
          totalShares: 2000,
          codeA: "XLM",
          codeB: "TKN",
        }
      : opts.pool) as PoolSnapshot | null,
    shares: opts.shares ?? 200,
  };
  (service as any).fetchPool = async () => state.pool;
  (service as any).fetchShares = async () => new Map([[POOL, state.shares]]);
  return { service, alerts, notifications, email, sent, state, history };
}

const base = {
  poolId: POOL,
  metric: "PRICE" as const,
  condition: "ABOVE" as const,
  threshold: 0.2,
  notifyBrowser: true,
  notifyEmail: false,
};

describe("AlertsService", () => {
  describe("create", () => {
    it("stores the alert with pool asset codes and starts it active", async () => {
      const { service } = setup();
      const a = await service.create(USER, base);
      expect(a).toMatchObject({
        status: "ACTIVE",
        codeA: "XLM",
        codeB: "TKN",
        quoteSide: "A",
        email: null,
      });
    });

    it("rejects: no channel, email without server support, unknown pool, IL below, over the limit", async () => {
      const { service } = setup({ emailEnabled: false });
      await expect(
        service.create(USER, { ...base, notifyBrowser: false }),
      ).rejects.toThrow(/channel/);
      await expect(
        service.create(USER, { ...base, notifyEmail: true, email: "a@b.co" }),
      ).rejects.toThrow(/not configured/);
      await expect(
        service.create(USER, {
          ...base,
          metric: "IMPERMANENT_LOSS_PCT",
          condition: "BELOW",
        }),
      ).rejects.toThrow(/rises above/);
      const missing = setup({ pool: null });
      await expect(missing.service.create(USER, base)).rejects.toThrow(
        /Pool not found/,
      );

      await service.create(USER, base);
      await service.create(USER, base);
      await expect(service.create(USER, base)).rejects.toThrow(/at most 2/);
    });
  });

  describe("evaluateAll", () => {
    it("fires once when the price crosses the threshold, then stays quiet", async () => {
      const { service, alerts, notifications } = setup();
      await service.create(USER, base); // price A = 0.25 >= 0.2

      const first = await service.evaluateAll();
      expect(first).toEqual({ checked: 1, triggered: 1 });
      expect(alerts.rows[0]).toMatchObject({
        status: "TRIGGERED",
        triggeredValue: 0.25,
      });
      expect(notifications.rows).toHaveLength(1);
      expect(notifications.rows[0]).toMatchObject({
        popup: true,
        userPublicKey: USER,
      });
      expect(notifications.rows[0].message).toContain("rose above");

      const second = await service.evaluateAll();
      expect(second.triggered).toBe(0);
      expect(notifications.rows).toHaveLength(1);
    });

    it("records the last value and keeps waiting while the condition is not met", async () => {
      const { service, alerts } = setup();
      await service.create(USER, { ...base, threshold: 5 });
      const r = await service.evaluateAll();
      expect(r.triggered).toBe(0);
      expect(alerts.rows[0]).toMatchObject({
        status: "ACTIVE",
        lastValue: 0.25,
      });
    });

    it("sends the email when asked and records the outcome", async () => {
      const { service, alerts, sent } = setup();
      await service.create(USER, {
        ...base,
        notifyEmail: true,
        email: "me@example.com",
      });
      await service.evaluateAll();
      expect(sent).toHaveLength(1);
      expect(sent[0][0]).toBe("me@example.com");
      expect(alerts.rows[0].emailStatus).toBe("SENT");
    });

    it("does not double-fire if another instance claimed the alert first", async () => {
      const { service, alerts, notifications } = setup();
      await service.create(USER, base);
      const realUpdate = alerts.update;
      alerts.update = async (where: any, patch: any) => {
        if (patch.status === "TRIGGERED") return { affected: 0 }; // lost the race
        return realUpdate(where, patch);
      };
      const r = await service.evaluateAll();
      expect(r.triggered).toBe(0);
      expect(notifications.rows).toHaveLength(0);
    });

    it("skips position alerts when the wallet holds no shares", async () => {
      const { service, alerts } = setup({ shares: 0 });
      await service.create(USER, {
        ...base,
        metric: "POSITION_VALUE",
        threshold: 1,
      });
      const r = await service.evaluateAll();
      expect(r).toEqual({ checked: 0, triggered: 0 });
      expect(alerts.rows[0].status).toBe("ACTIVE");
    });

    it("evaluates position value and impermanent loss from the pool ratio", async () => {
      const { service, alerts } = setup();
      await service.create(USER, {
        ...base,
        metric: "POSITION_VALUE",
        condition: "BELOW",
        threshold: 500,
      });
      await service.evaluateAll(); // 200 XLM <= 500
      expect(alerts.rows[0]).toMatchObject({
        status: "TRIGGERED",
        triggeredValue: 200,
      });

      const il = setup({
        pool: {
          reserveA: 2000,
          reserveB: 500,
          totalShares: 1000,
          codeA: "XLM",
          codeB: "TKN",
        },
        shares: 100,
      });
      il.history.calculateUserCostBasis.mockResolvedValue({
        costBasisA: "100",
        costBasisB: "100",
      });
      await il.service.create(USER, {
        ...base,
        metric: "IMPERMANENT_LOSS_PCT",
        threshold: 10,
      });
      await il.service.evaluateAll();
      expect(il.alerts.rows[0].status).toBe("TRIGGERED");
      expect(il.alerts.rows[0].triggeredValue).toBeCloseTo(20, 6);
    });
  });

  describe("update / remove / notifications", () => {
    it("re-arms a triggered alert and clears its fired state", async () => {
      const { service, alerts } = setup();
      const a = await service.create(USER, base);
      await service.evaluateAll();
      expect(alerts.rows[0].status).toBe("TRIGGERED");

      const updated = await service.update(USER, a.id, {
        status: "ACTIVE",
        threshold: 9,
      });
      expect(updated).toMatchObject({
        status: "ACTIVE",
        threshold: 9,
        triggeredAt: null,
        triggeredValue: null,
      });
    });

    it("only lets the owner change or delete an alert", async () => {
      const { service } = setup();
      const a = await service.create(USER, base);
      const other = "G".padEnd(56, "B");
      await expect(
        service.update(other, a.id, { threshold: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(other, a.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.remove(USER, a.id)).resolves.toEqual({
        deleted: true,
      });
    });

    it("marks notifications read so they are not delivered twice", async () => {
      const { service } = setup();
      await service.create(USER, base);
      await service.evaluateAll();

      const unread = await service.listNotifications(USER, true);
      expect(unread).toHaveLength(1);

      expect(await service.markRead(USER, [unread[0].id])).toEqual({
        updated: 1,
      });
      expect(await service.listNotifications(USER, true)).toHaveLength(0);
      expect(await service.listNotifications(USER, false)).toHaveLength(1);
    });

    it("does not touch another user's notifications", async () => {
      const { service } = setup();
      await service.create(USER, base);
      await service.evaluateAll();
      expect(await service.markRead("G".padEnd(56, "B"))).toEqual({
        updated: 0,
      });
      expect(await service.listNotifications(USER, true)).toHaveLength(1);
    });
  });

  it("reports whether email is available", () => {
    expect(setup({ emailEnabled: false }).service.getConfig()).toMatchObject({
      emailEnabled: false,
      maxAlerts: 2,
    });
  });
});

it("rejects invalid input shapes early", async () => {
  const { service } = setup();
  await expect(
    service.currentValue(USER, POOL, "PRICE"),
  ).resolves.toMatchObject({ value: 0.25, codeA: "XLM" });
  const missing = setup({ pool: null });
  await expect(
    missing.service.currentValue(USER, POOL, "PRICE"),
  ).rejects.toBeInstanceOf(BadRequestException);
});
