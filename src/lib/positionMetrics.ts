export type PositionMetric = 'value' | 'interest' | 'apy'

export type PoolSnapshot = {
  timestamp: string
  supplyApy: number
  totalSupply: number
}

export type PositionMetricPoint = {
  date: string
  timestamp: number
  value: number
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

function validSnapshots(snapshots: PoolSnapshot[], days: 7 | 30): Array<PoolSnapshot & { time: number }> {
  const valid = snapshots
    .map((snapshot) => ({ ...snapshot, time: new Date(snapshot.timestamp).getTime() }))
    .filter((snapshot) => Number.isFinite(snapshot.time))
    .sort((a, b) => a.time - b.time)

  const latest = valid.at(-1)?.time
  if (latest === undefined) return []
  const cutoff = latest - days * 24 * 60 * 60 * 1000
  return valid.filter((snapshot) => snapshot.time >= cutoff)
}

export function buildPositionMetricSeries({
  currentInterestUsd,
  currentValueUsd,
  days,
  metric,
  snapshots,
}: {
  currentInterestUsd: number
  currentValueUsd: number
  days: 7 | 30
  metric: PositionMetric
  snapshots: PoolSnapshot[]
}): PositionMetricPoint[] {
  const points = validSnapshots(snapshots, days)
  if (points.length === 0) return []

  const latestSupply = Number(points.at(-1)?.totalSupply)
  const positionShare = latestSupply > 0 && currentValueUsd >= 0 ? currentValueUsd / latestSupply : 0
  const values = points.map((point) => Math.max(0, Number(point.totalSupply) || 0) * positionShare)

  let accrued = 0
  const modeledInterest = points.map((point, index) => {
    if (index > 0) {
      const elapsed = Math.max(0, point.time - points[index - 1].time)
      const apy = Math.max(0, Number(points[index - 1].supplyApy) || 0)
      accrued += values[index - 1] * (apy / 100) * (elapsed / YEAR_MS)
    }
    return accrued
  })
  const modeledTotal = modeledInterest.at(-1) ?? 0
  const interestScale = modeledTotal > 0 && currentInterestUsd >= 0 ? currentInterestUsd / modeledTotal : 1

  let apySum = 0
  return points.map((point, index) => {
    apySum += Math.max(0, Number(point.supplyApy) || 0)
    const value = metric === 'value'
      ? values[index]
      : metric === 'interest'
        ? modeledInterest[index] * interestScale
        : apySum / (index + 1)
    return {
      date: new Date(point.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      timestamp: point.time,
      value: Number.isFinite(value) ? value : 0,
    }
  })
}
