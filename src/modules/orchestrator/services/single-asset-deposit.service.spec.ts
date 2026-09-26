import { BadRequestException } from "@nestjs/common";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { SingleAssetDepositService } from "./single-asset-deposit.service";
import { planSingleAssetDeposit } from "./single-asset.calculator";

const ISSUER = Keypair.random().publicKey();
const USER = Keypair.random().publicKey();
const POOL_ID = "a".repeat(64);
const PASSPHRASE = "Test SDF Network ; September 2015";

const config: any = {
  horizonUrl: "https://horizon.test",
  networkPassphrase: PASSPHRASE,
  defaultSlippageBps: 100,
  maxSlippageBps: 500,
};

// A = XLM (native always sorts first), B = TKN
const pool = {
  type: "constant_product",
  fee_bp: 30,
  reserves: [
    { asset: "native", amount: "1482.2814412" },
    { asset: `TKN:${ISSUER}`, amount: "145814396.994845" },
  ],
};

function makeService(overrides: {
  balances?: any[];
  pool?: any;
  paths?: any[];
  poolError?: boolean;
}) {
  const balances = overrides.balances ?? [
    { asset_type: "native", balance: "1000.0000000" },
  ];
  const account: any = {
    sequence: "1",
    balances,
    subentry_count: 0,
    sequenceNumber: () => "1",
  };
  const fakeHorizon: any = {
    liquidityPools: () => ({
      liquidityPoolId: () => ({
        call: async () => {
          if (overrides.poolError) throw new Error("404");
          return overrides.pool ?? pool;
        },
      }),
    }),
    loadAccount: async () => account,
    strictReceivePaths: (_src: any, _dest: any, amount: string) => ({
      call: async () => ({
        records: overrides.paths ?? [],
        amount,
      }),
    }),
  };

  const service = new SingleAssetDepositService(config);
  (service as any).horizon = () => fakeHorizon;
  return { service, fakeHorizon };
}

describe("SingleAssetDepositService", () => {
  const dto = { poolId: POOL_ID, sourceAsset: "XLM", amount: 100 };

  /** What the pool-only model expects the swap to cost, so the mocked Horizon route agrees with it. */
  const modelSpend = (input: typeof dto) =>
    planSingleAssetDeposit({
      amount: input.amount,
      reserveIn: input.sourceAsset === "XLM" ? 1482.2814412 : 145814396.994845,
      reserveOut: input.sourceAsset === "XLM" ? 145814396.994845 : 1482.2814412,
      feeBp: 30,
      slippageBps: 100,
    }).swapAmount;

  async function build(overrides: any = {}, input = dto) {
    const { service } = makeService({
      paths: [{ source_amount: String(modelSpend(input)), path: [] }],
      ...overrides,
    });
    return service.build(USER, input);
  }

  it("builds one atomic tx: trustlines, strict-receive swap, then LP deposit", async () => {
    const res = await build();
    const tx: any = TransactionBuilder.fromXDR(res.xdr, PASSPHRASE);
    expect(tx.operations.map((o: any) => o.type)).toEqual([
      "changeTrust", // TKN
      "changeTrust", // LP shares
      "pathPaymentStrictReceive",
      "liquidityPoolDeposit",
    ]);
    const swap = tx.operations[2];
    expect(swap.destination).toBe(USER);
    expect(Number(swap.sendMax)).toBeLessThanOrEqual(100);
    const deposit = tx.operations[3];
    expect(Number(deposit.maxAmountB)).toBeCloseTo(Number(swap.destAmount), 7);
    expect(res.plan.addsTrustlines).toEqual(["TKN", "LP shares"]);
  });

  it("skips trustlines the wallet already has", async () => {
    const res = await build({
      balances: [
        { asset_type: "native", balance: "1000.0000000" },
        { asset_code: "TKN", asset_issuer: ISSUER, balance: "0" },
        {
          asset_type: "liquidity_pool_shares",
          liquidity_pool_id: POOL_ID,
          balance: "0",
        },
      ],
    });
    const tx: any = TransactionBuilder.fromXDR(res.xdr, PASSPHRASE);
    expect(tx.operations.map((o: any) => o.type)).toEqual([
      "pathPaymentStrictReceive",
      "liquidityPoolDeposit",
    ]);
  });

  it("rejects an asset that is not in the pool", async () => {
    await expect(
      build({}, { ...dto, sourceAsset: "EURC" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects when the wallet cannot cover the amount plus reserves", async () => {
    await expect(
      build({ balances: [{ asset_type: "native", balance: "100.5000000" }] }),
    ).rejects.toThrow(/Not enough XLM/);
  });

  it("rejects an unknown pool", async () => {
    await expect(build({ poolError: true })).rejects.toThrow(/Pool not found/);
  });

  it("refuses when the best route is not the pool alone", async () => {
    const { service } = makeService({
      paths: [{ source_amount: "10", path: [{ asset_code: "USDC" }] }],
    });
    await expect(service.build(USER, dto)).rejects.toThrow(
      /does not go through this pool alone/,
    );
  });

  it("caps slippage at the configured maximum", async () => {
    const { service } = makeService({});
    await expect(
      service.build(USER, { ...dto, slippageBps: 900 }),
    ).rejects.toThrow(/Slippage/);
  });
});
