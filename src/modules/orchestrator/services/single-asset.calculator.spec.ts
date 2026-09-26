import {
  amountIn,
  amountOut,
  planSingleAssetDeposit,
  swapAmountForDeposit,
} from "./single-asset.calculator";

describe("single asset calculator", () => {
  // Values taken from a live testnet pool (XLM/RHINO)
  const rIn = 1482.2814412;
  const rOut = 145814396.994845;

  it("matches the swap amount verified against Horizon (100 XLM -> ~49.2579)", () => {
    expect(swapAmountForDeposit(100, rIn, 30)).toBeCloseTo(49.2578943, 6);
  });

  it("leaves the rest of the budget in exactly the post-swap pool ratio", () => {
    const x = swapAmountForDeposit(100, rIn, 30);
    const out = amountOut(x, rIn, rOut, 30);
    const ratioAfter = (rIn + x) / (rOut - out);
    expect((100 - x) / out).toBeCloseTo(ratioAfter, 9);
  });

  it("amountIn inverts amountOut", () => {
    const out = amountOut(10, rIn, rOut, 30);
    expect(amountIn(out, rIn, rOut, 30)).toBeCloseTo(10, 9);
  });

  describe("planSingleAssetDeposit", () => {
    const plan = planSingleAssetDeposit({
      amount: 100,
      reserveIn: rIn,
      reserveOut: rOut,
      feeBp: 30,
      slippageBps: 100,
    });

    it("never spends more than the user has, even in the worst case", () => {
      expect(plan.sendMax + plan.maxDepositIn).toBeLessThanOrEqual(100 + 1e-7);
    });

    it("keeps the deposit cap above what the deposit actually needs", () => {
      expect(plan.maxDepositIn).toBeGreaterThanOrEqual(
        plan.expectedDepositIn - 1e-6,
      );
    });

    it("only leaves roughly the slippage margin of the input asset unused", () => {
      expect(plan.estimatedLeftoverIn).toBeGreaterThanOrEqual(0);
      expect(plan.estimatedLeftoverIn).toBeLessThan(100 * 0.011);
    });

    it("receives an exact 7-decimal amount", () => {
      expect(Math.round(plan.receiveAmount * 1e7)).toBeCloseTo(
        plan.receiveAmount * 1e7,
        5,
      );
    });

    it("reports a positive price impact for a swap that moves the pool", () => {
      expect(plan.priceImpactPct).toBeGreaterThan(0);
    });
  });

  it("is symmetric: swapping from the other side also balances", () => {
    const plan = planSingleAssetDeposit({
      amount: 1_000_000,
      reserveIn: rOut,
      reserveOut: rIn,
      feeBp: 30,
      slippageBps: 50,
    });
    expect(plan.receiveAmount).toBeGreaterThan(0);
    expect(plan.sendMax + plan.maxDepositIn).toBeLessThanOrEqual(
      1_000_000 + 1e-7,
    );
  });

  it("rejects amounts that cannot work", () => {
    expect(() =>
      planSingleAssetDeposit({
        amount: 0,
        reserveIn: 10,
        reserveOut: 10,
        feeBp: 30,
        slippageBps: 50,
      }),
    ).toThrow();
    expect(() =>
      planSingleAssetDeposit({
        amount: 1e-9,
        reserveIn: 1e6,
        reserveOut: 1e6,
        feeBp: 30,
        slippageBps: 50,
      }),
    ).toThrow();
  });
});
