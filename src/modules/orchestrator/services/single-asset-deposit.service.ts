import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import {
  Account,
  Asset,
  Horizon,
  LiquidityPoolAsset,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { appConfig } from "../../../config/app.config";
import { BuildSingleAssetDepositDto } from "../dto/single-asset-request.dto";
import { planSingleAssetDeposit } from "./single-asset.calculator";

const BASE_RESERVE = 0.5;
const FEE_PER_OP = "1000";
// Swap output can differ from the pool-only model when a better route exists (order book, other pools).
const ROUTE_TOLERANCE = 0.01;

const fmt = (n: number) => n.toFixed(7);
const price = (n: number) => n.toPrecision(12);

export interface SingleAssetDepositResult {
  xdr: string;
  networkPassphrase: string;
  plan: {
    sourceAsset: string;
    destAsset: string;
    swapAmount: number;
    receiveAmount: number;
    sendMax: number;
    expectedDepositSource: number;
    expectedDepositDest: number;
    priceImpactPct: number;
    estimatedLeftoverSource: number;
    slippageBps: number;
    addsTrustlines: string[];
  };
}

type PoolSide = { asset: Asset; code: string; key: string; reserve: number };

const toSide = (r: { asset: string; amount: string }): PoolSide => {
  if (r.asset === "native") {
    return {
      asset: Asset.native(),
      code: "XLM",
      key: "native",
      reserve: Number(r.amount),
    };
  }
  const [code, issuer] = r.asset.split(":");
  return {
    asset: new Asset(code, issuer),
    code,
    key: r.asset,
    reserve: Number(r.amount),
  };
};

@Injectable()
export class SingleAssetDepositService {
  constructor(
    @Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>,
  ) {}

  protected horizon(): Horizon.Server {
    return new Horizon.Server(this.config.horizonUrl);
  }

  /**
   * Builds ONE transaction that lets a user with a single pool asset provide liquidity:
   * [trustlines] -> path payment (strict receive) into the other asset -> liquidity pool deposit.
   * Operations run in order and atomically, so the deposit sees the swapped funds and any failure
   * reverts the whole thing.
   */
  async build(
    publicKey: string,
    dto: BuildSingleAssetDepositDto,
  ): Promise<SingleAssetDepositResult> {
    const slippageBps = dto.slippageBps || this.config.defaultSlippageBps;
    if (slippageBps > this.config.maxSlippageBps) {
      throw new BadRequestException(
        `Slippage cannot exceed ${this.config.maxSlippageBps} bps`,
      );
    }

    const horizon = this.horizon();

    // Live reserves: the pool table in our DB can be minutes old and the maths depends on exact reserves.
    let pool: Horizon.ServerApi.LiquidityPoolRecord;
    try {
      pool = await horizon.liquidityPools().liquidityPoolId(dto.poolId).call();
    } catch {
      throw new BadRequestException("Pool not found");
    }
    if (pool.type !== "constant_product" || pool.reserves.length !== 2) {
      throw new BadRequestException(
        "Only constant product pools are supported",
      );
    }

    const [sideA, sideB] = pool.reserves.map(toSide);
    const wanted = dto.sourceAsset.toUpperCase();
    const matches = (s: PoolSide) =>
      s.key.toUpperCase() === wanted ||
      (!wanted.includes(":") && s.code.toUpperCase() === wanted);
    const sourceIsA = matches(sideA);
    if (!sourceIsA && !matches(sideB)) {
      throw new BadRequestException(
        `${dto.sourceAsset} is not an asset of this pool`,
      );
    }
    const source = sourceIsA ? sideA : sideB;
    const dest = sourceIsA ? sideB : sideA;

    let plan;
    try {
      plan = planSingleAssetDeposit({
        amount: dto.amount,
        reserveIn: source.reserve,
        reserveOut: dest.reserve,
        feeBp: pool.fee_bp,
        slippageBps,
      });
    } catch (e) {
      throw new BadRequestException(e.message);
    }

    let account: Horizon.AccountResponse;
    try {
      account = await horizon.loadAccount(publicKey);
    } catch {
      throw new BadRequestException(
        "Source account does not exist on the network",
      );
    }

    const hasDestTrustline =
      dest.asset.isNative() ||
      account.balances.some(
        (b: any) =>
          b.asset_code === dest.code &&
          b.asset_issuer === dest.asset.getIssuer(),
      );
    const hasLpTrustline = account.balances.some(
      (b: any) => b.liquidity_pool_id === dto.poolId,
    );

    this.assertFunds(account, source, dto.amount, {
      // dest trustline = 1 subentry, LP share trustline = 2 subentries
      newSubentries: (hasDestTrustline ? 0 : 1) + (hasLpTrustline ? 0 : 2),
    });
    await this.assertDirectRoute(
      horizon,
      source,
      dest,
      plan.receiveAmount,
      plan.swapAmount,
    );

    // Pool price after our own swap, as A per B, with room for small moves before the tx lands.
    const priceAB = sourceIsA ? plan.priceAfter : 1 / plan.priceAfter;
    const tol = Math.max(slippageBps / 10000, 0.005) * 2;

    const builder = new TransactionBuilder(
      new Account(publicKey, account.sequence),
      {
        fee: FEE_PER_OP,
        networkPassphrase: this.config.networkPassphrase,
      },
    );
    const addsTrustlines: string[] = [];

    if (!hasDestTrustline) {
      builder.addOperation(Operation.changeTrust({ asset: dest.asset }));
      addsTrustlines.push(dest.code);
    }
    if (!hasLpTrustline) {
      builder.addOperation(
        Operation.changeTrust({
          asset: new LiquidityPoolAsset(sideA.asset, sideB.asset, pool.fee_bp),
        }),
      );
      addsTrustlines.push("LP shares");
    }

    const tx = builder
      .addOperation(
        Operation.pathPaymentStrictReceive({
          sendAsset: source.asset,
          sendMax: fmt(plan.sendMax),
          destination: publicKey,
          destAsset: dest.asset,
          destAmount: fmt(plan.receiveAmount),
          path: [],
        }),
      )
      .addOperation(
        Operation.liquidityPoolDeposit({
          liquidityPoolId: dto.poolId,
          maxAmountA: fmt(sourceIsA ? plan.maxDepositIn : plan.receiveAmount),
          maxAmountB: fmt(sourceIsA ? plan.receiveAmount : plan.maxDepositIn),
          minPrice: price(priceAB * (1 - tol)),
          maxPrice: price(priceAB * (1 + tol)),
        }),
      )
      .setTimeout(300)
      .build();

    return {
      xdr: tx.toXDR(),
      networkPassphrase: this.config.networkPassphrase,
      plan: {
        sourceAsset: source.code,
        destAsset: dest.code,
        swapAmount: plan.swapAmount,
        receiveAmount: plan.receiveAmount,
        sendMax: plan.sendMax,
        expectedDepositSource: plan.expectedDepositIn,
        expectedDepositDest: plan.receiveAmount,
        priceImpactPct: plan.priceImpactPct,
        estimatedLeftoverSource: plan.estimatedLeftoverIn,
        slippageBps,
        addsTrustlines,
      },
    };
  }

  private assertFunds(
    account: Horizon.AccountResponse,
    source: PoolSide,
    amount: number,
    opts: { newSubentries: number },
  ) {
    const line: any = account.balances.find((b: any) =>
      source.asset.isNative()
        ? b.asset_type === "native"
        : b.asset_code === source.code &&
          b.asset_issuer === source.asset.getIssuer(),
    );
    const balance = Number(line?.balance ?? 0);
    const selling = Number(line?.selling_liabilities ?? 0);
    let available = balance - selling;

    if (source.asset.isNative()) {
      const subentries = Number((account as any).subentry_count ?? 0);
      const sponsoring = Number((account as any).num_sponsoring ?? 0);
      const sponsored = Number((account as any).num_sponsored ?? 0);
      const reserve =
        (2 + subentries + opts.newSubentries + sponsoring - sponsored) *
        BASE_RESERVE;
      // fees for at most 4 operations
      available -= reserve + 0.01;
    }

    if (amount > available) {
      throw new BadRequestException(
        `Not enough ${source.code}: ${Math.max(0, available).toFixed(7)} usable (after reserves), ${amount} requested`,
      );
    }
  }

  /**
   * The maths assumes the swap runs against this pool only. If Horizon's best route is different
   * (order book, other pools) the pool ratio would not shift the way we priced the deposit for.
   */
  private async assertDirectRoute(
    horizon: Horizon.Server,
    source: PoolSide,
    dest: PoolSide,
    receiveAmount: number,
    expectedSpend: number,
  ) {
    const res = await horizon
      .strictReceivePaths([source.asset], dest.asset, fmt(receiveAmount))
      .call();
    const best = res.records
      .slice()
      .sort((a, b) => Number(a.source_amount) - Number(b.source_amount))[0];

    if (!best) {
      throw new BadRequestException("No swap route found for this pair");
    }
    const quoted = Number(best.source_amount);
    const off = Math.abs(quoted - expectedSpend) / expectedSpend;
    if (best.path.length > 0 || off > ROUTE_TOLERANCE) {
      throw new BadRequestException(
        "The best swap route does not go through this pool alone, so a single-asset deposit is not supported for this pair yet",
      );
    }
  }
}
