import type { DeFiPool, LocalPosition } from '../types/stellar'

const INACTIVE_POSITION_STATUSES = new Set(['CLOSED', 'WITHDRAWN', 'REMOVED', 'FAILED'])

export function isActivePositionForPool(position: LocalPosition, pool: DeFiPool): boolean {
  const belongsToPool = Boolean(position.poolId) && (
    position.poolId === pool.id || Boolean(pool.contractId && position.poolId === pool.contractId)
  )
  const amount = Number(position.amount)
  const status = String(position.status || '').trim().toUpperCase()

  return belongsToPool
    && Number.isFinite(amount)
    && amount > 0
    && !INACTIVE_POSITION_STATUSES.has(status)
}

export function findActivePositionForPool(positions: LocalPosition[], pool: DeFiPool): LocalPosition | undefined {
  return positions.find((position) => isActivePositionForPool(position, pool))
}
