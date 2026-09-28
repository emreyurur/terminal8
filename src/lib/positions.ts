import type { DeFiPool, LocalPosition } from '../types/stellar'

type LivePoolApy = Pick<DeFiPool, 'apy' | 'apyAvailable' | 'contractId' | 'id'>

/** Uses the latest pool metric for open positions instead of the APY captured when they were created. */
export function applyLivePoolApys(positions: LocalPosition[], pools: LivePoolApy[]): LocalPosition[] {
  return positions.map((position) => {
    const positionPoolId = position.poolId.trim().toLowerCase()
    if (!positionPoolId) return position

    const pool = pools.find((candidate) => (
      candidate.id.trim().toLowerCase() === positionPoolId
      || candidate.contractId.trim().toLowerCase() === positionPoolId
    ))
    if (!pool?.apyAvailable || !Number.isFinite(pool.apy)) return position
    if (position.apy === pool.apy) return position
    return { ...position, apy: pool.apy }
  })
}

/**
 * Folds positions in the same pool into one, so repeated deposits show up as a single row.
 * Amounts add up; the yield clock (`openedAt`) and `apy` are amount-weighted so earnings stay sensible.
 * Positions without a pool id are left untouched.
 */
export function mergePositionsByPool(positions: LocalPosition[]): LocalPosition[] {
  const merged: LocalPosition[] = []
  const byPool = new Map<string, number>()

  for (const pos of positions) {
    const index = pos.poolId ? byPool.get(pos.poolId) : undefined
    if (index === undefined) {
      if (pos.poolId) byPool.set(pos.poolId, merged.length)
      merged.push(pos)
      continue
    }

    const base = merged[index]
    const baseAmount = Number(base.amount) || 0
    const addAmount = Number(pos.amount) || 0
    const total = baseAmount + addAmount
    const weight = (a: number, b: number) => (total > 0 ? (a * baseAmount + b * addAmount) / total : a)

    // `positions` is newest-first, so `pos` (later in the list) is the older entry: keep the newest hash/status/id.
    merged[index] = {
      ...base,
      amount: total,
      openedAt: Math.round(weight(Number(base.openedAt) || 0, Number(pos.openedAt) || 0)),
      apy: weight(Number(base.apy) || 0, Number(pos.apy) || 0),
    }
  }

  return merged
}

/** Adds a new deposit to the list, merging it into an existing position of the same pool. */
export function addPosition(positions: LocalPosition[], added: LocalPosition): LocalPosition[] {
  return mergePositionsByPool([added, ...positions])
}
