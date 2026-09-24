import { describe, expect, it } from 'vitest'
import { buildPositionMetricSeries, type PoolSnapshot } from './positionMetrics'

const snapshots: PoolSnapshot[] = [
  { timestamp: '2026-09-01T00:00:00.000Z', supplyApy: 10, totalSupply: 1000 },
  { timestamp: '2026-09-10T00:00:00.000Z', supplyApy: 20, totalSupply: 1500 },
  { timestamp: '2026-09-20T00:00:00.000Z', supplyApy: 30, totalSupply: 2000 },
]

describe('position metric series', () => {
  it('derives historical position value from the current portfolio share and pool snapshots', () => {
    const series = buildPositionMetricSeries({ snapshots, metric: 'value', days: 30, currentValueUsd: 200, currentInterestUsd: 12 })
    expect(series.map((point) => point.value)).toEqual([100, 150, 200])
  })

  it('builds a running average APY from API snapshots', () => {
    const series = buildPositionMetricSeries({ snapshots, metric: 'apy', days: 30, currentValueUsd: 200, currentInterestUsd: 12 })
    expect(series.map((point) => point.value)).toEqual([10, 15, 20])
  })

  it('anchors modeled interest to the current portfolio PnL', () => {
    const series = buildPositionMetricSeries({ snapshots, metric: 'interest', days: 30, currentValueUsd: 200, currentInterestUsd: 12 })
    expect(series.at(-1)?.value).toBeCloseTo(12)
  })

  it('filters snapshots to the selected period and returns no fake points', () => {
    const series = buildPositionMetricSeries({ snapshots, metric: 'value', days: 7, currentValueUsd: 200, currentInterestUsd: 12 })
    expect(series).toHaveLength(1)
    expect(buildPositionMetricSeries({ snapshots: [], metric: 'value', days: 30, currentValueUsd: 200, currentInterestUsd: 12 })).toEqual([])
  })
})
