export type AlertMetric = "PRICE" | "POSITION_VALUE" | "IMPERMANENT_LOSS_PCT";
export type AlertCondition = "ABOVE" | "BELOW";
/** Which pool asset a price or value is expressed in. */
export type QuoteSide = "A" | "B";

export const ALERT_METRICS: AlertMetric[] = [
  "PRICE",
  "POSITION_VALUE",
  "IMPERMANENT_LOSS_PCT",
];

export interface PoolSnapshot {
  reserveA: number;
  reserveB: number;
  totalShares: number;
  codeA: string;
  codeB: string;
}

/** Units of `quoteSide` asset per one unit of the other asset. Needs no oracle: it is the pool's own ratio. */
export function poolPrice(
  pool: PoolSnapshot,
  quoteSide: QuoteSide,
): number | null {
  if (!(pool.reserveA > 0) || !(pool.reserveB > 0)) return null;
  return quoteSide === "A"
    ? pool.reserveA / pool.reserveB
    : pool.reserveB / pool.reserveA;
}

/**
 * Worth of a wallet's LP shares, in units of the `quoteSide` asset. In a constant product pool both sides
 * hold equal value, so the position is twice its share of the quote side reserve.
 */
export function positionValue(
  pool: PoolSnapshot,
  shares: number,
  quoteSide: QuoteSide,
): number | null {
  if (!(shares > 0) || !(pool.totalShares > 0)) return null;
  const reserve = quoteSide === "A" ? pool.reserveA : pool.reserveB;
  return 2 * (shares / pool.totalShares) * reserve;
}

/**
 * Impermanent loss versus simply holding what was deposited, in percent (0 when the pool is ahead,
 * e.g. thanks to fees). Both sides are valued at today's pool price, so no USD prices are involved.
 * Returns null when there is no deposit history to compare against.
 */
export function impermanentLossPct(
  pool: PoolSnapshot,
  shares: number,
  depositedA: number,
  depositedB: number,
): number | null {
  if (
    !(shares > 0) ||
    !(pool.totalShares > 0) ||
    !(pool.reserveA > 0) ||
    !(pool.reserveB > 0)
  )
    return null;

  const heldInA = depositedA + depositedB * (pool.reserveA / pool.reserveB);
  if (!(heldInA > 0)) return null;

  const lpInA = 2 * (shares / pool.totalShares) * pool.reserveA;
  return Math.max(0, ((heldInA - lpInA) / heldInA) * 100);
}

export function isTriggered(
  value: number,
  condition: AlertCondition,
  threshold: number,
): boolean {
  return condition === "ABOVE" ? value >= threshold : value <= threshold;
}

const num = (n: number) =>
  Math.abs(n) >= 1
    ? n.toLocaleString("en-US", { maximumFractionDigits: 4 })
    : n.toPrecision(4);

export function describeAlert(a: {
  metric: AlertMetric;
  condition: AlertCondition;
  threshold: number;
  quoteSide: QuoteSide;
  codeA: string;
  codeB: string;
}): string {
  const quote = a.quoteSide === "A" ? a.codeA : a.codeB;
  const base = a.quoteSide === "A" ? a.codeB : a.codeA;
  const dir = a.condition === "ABOVE" ? "rose above" : "fell below";
  switch (a.metric) {
    case "PRICE":
      return `1 ${base} price ${dir} ${num(a.threshold)} ${quote}`;
    case "POSITION_VALUE":
      return `Your ${a.codeA}/${a.codeB} position value ${dir} ${num(a.threshold)} ${quote}`;
    case "IMPERMANENT_LOSS_PCT":
      return `Impermanent loss on ${a.codeA}/${a.codeB} ${dir} ${num(a.threshold)}%`;
  }
}

export function formatValue(
  metric: AlertMetric,
  value: number,
  codeA: string,
  codeB: string,
  quoteSide: QuoteSide,
): string {
  const quote = quoteSide === "A" ? codeA : codeB;
  return metric === "IMPERMANENT_LOSS_PCT"
    ? `${num(value)}%`
    : `${num(value)} ${quote}`;
}
