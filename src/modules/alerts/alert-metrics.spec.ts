import {
  PoolSnapshot,
  describeAlert,
  impermanentLossPct,
  isTriggered,
  poolPrice,
  positionValue,
} from "./alert-metrics";

const pool: PoolSnapshot = { reserveA: 1000, reserveB: 4000, totalShares: 2000, codeA: "XLM", codeB: "TKN" };

describe("alert metrics", () => {
  it("prices the pool in either asset from its own reserves", () => {
    expect(poolPrice(pool, "A")).toBe(0.25); // XLM per TKN
    expect(poolPrice(pool, "B")).toBe(4); // TKN per XLM
    expect(poolPrice({ ...pool, reserveB: 0 }, "A")).toBeNull();
  });

  it("values shares as twice their part of the quote reserve", () => {
    // 10% of the pool: 100 XLM + 400 TKN => worth 200 XLM or 800 TKN
    expect(positionValue(pool, 200, "A")).toBeCloseTo(200);
    expect(positionValue(pool, 200, "B")).toBeCloseTo(800);
    expect(positionValue(pool, 0, "A")).toBeNull();
  });

  describe("impermanent loss", () => {
    it("is zero when the price has not moved", () => {
      // deposited 100 XLM + 400 TKN at 0.25 XLM/TKN, still 0.25 now
      expect(impermanentLossPct(pool, 200, 100, 400)).toBeCloseTo(0, 6);
    });

    it("matches the textbook value for a 4x price move (~20%)", () => {
      // entry: 100 XLM + 100 TKN (price 1). Now the pool holds the same share at price 4 (A per B).
      const moved: PoolSnapshot = { reserveA: 2000, reserveB: 500, totalShares: 1000, codeA: "XLM", codeB: "TKN" };
      // wallet owns 10% => 200 XLM + 50 TKN. Held: 100 XLM + 100 TKN = 100 + 100*4 = 500 XLM. LP: 400 XLM.
      expect(impermanentLossPct(moved, 100, 100, 100)).toBeCloseTo(20, 6);
    });

    it("never reports a negative loss when fees put the pool ahead", () => {
      expect(impermanentLossPct(pool, 400, 100, 400)).toBe(0);
    });

    it("returns null without deposit history or shares", () => {
      expect(impermanentLossPct(pool, 200, 0, 0)).toBeNull();
      expect(impermanentLossPct(pool, 0, 100, 400)).toBeNull();
    });
  });

  it("checks thresholds in both directions, inclusive", () => {
    expect(isTriggered(10, "ABOVE", 10)).toBe(true);
    expect(isTriggered(9.99, "ABOVE", 10)).toBe(false);
    expect(isTriggered(5, "BELOW", 5)).toBe(true);
    expect(isTriggered(5.01, "BELOW", 5)).toBe(false);
  });

  it("describes an alert in plain words", () => {
    const base = { threshold: 0.3, quoteSide: "A" as const, codeA: "XLM", codeB: "TKN" };
    expect(describeAlert({ ...base, metric: "PRICE", condition: "BELOW" })).toBe("1 TKN price fell below 0.3000 XLM");
    expect(describeAlert({ ...base, metric: "IMPERMANENT_LOSS_PCT", condition: "ABOVE", threshold: 5 })).toBe(
      "Impermanent loss on XLM/TKN rose above 5%",
    );
  });
});
