export type AlertMetric = 'PRICE' | 'POSITION_VALUE' | 'IMPERMANENT_LOSS_PCT'
export type AlertCondition = 'ABOVE' | 'BELOW'
export type QuoteSide = 'A' | 'B'

export const METRIC_OPTIONS: { id: AlertMetric; label: string }[] = [
  { id: 'PRICE', label: 'Pool price' },
  { id: 'POSITION_VALUE', label: 'Position value' },
  { id: 'IMPERMANENT_LOSS_PCT', label: 'Impermanent loss %' },
]

type AlertLike = {
  metric: AlertMetric
  condition: AlertCondition
  threshold: number
  quoteSide: QuoteSide
  codeA: string
  codeB: string
}

/** Small values (prices) keep four significant digits, larger ones use grouping. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Math.abs(n) >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 4 }) : n.toPrecision(4)
}

export function quoteAsset(a: Pick<AlertLike, 'quoteSide' | 'codeA' | 'codeB'>): string {
  return a.quoteSide === 'A' ? a.codeA : a.codeB
}

export function formatAlertValue(a: AlertLike, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return a.metric === 'IMPERMANENT_LOSS_PCT' ? `${formatNumber(value)}%` : `${formatNumber(value)} ${quoteAsset(a)}`
}

/** "1 USDC price ≥ 0.5 XLM" style summary shown in the alert list. */
export function alertSummary(a: AlertLike): string {
  const cmp = a.condition === 'ABOVE' ? '≥' : '≤'
  const quote = quoteAsset(a)
  const base = a.quoteSide === 'A' ? a.codeB : a.codeA
  switch (a.metric) {
    case 'PRICE':
      return `1 ${base} price ${cmp} ${formatNumber(a.threshold)} ${quote}`
    case 'POSITION_VALUE':
      return `Position value ${cmp} ${formatNumber(a.threshold)} ${quote}`
    case 'IMPERMANENT_LOSS_PCT':
      return `Impermanent loss ${cmp} ${formatNumber(a.threshold)}%`
  }
}

/** Impermanent loss only makes sense as "rises above". */
export function allowedConditions(metric: AlertMetric): AlertCondition[] {
  return metric === 'IMPERMANENT_LOSS_PCT' ? ['ABOVE'] : ['ABOVE', 'BELOW']
}

export function isValidPoolId(id: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(id.trim())
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}
