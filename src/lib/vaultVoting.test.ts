import { describe, expect, it } from 'vitest'
import type { DeFiPool, LocalPosition } from '../types/stellar'
import { findActivePositionForPool, isActivePositionForPool } from './vaultVoting'

const pool: DeFiPool = {
  id: 'pool-a',
  contractId: 'contract-a',
  asset: 'XLM',
  secondaryAsset: 'USDC',
  protocol: 'Soroswap',
  category: 'AMM LP',
  apy: 10,
  tvl: '$1K',
  tvlRaw: 1000,
  reputation: { liquidity: 20, age: 15, audit: 20, activity: 10 },
  risk: 'Moderate',
  method: 'addLiquidity()',
  rationale: 'Test pool',
}

const position = (overrides: Partial<LocalPosition> = {}): LocalPosition => ({
  id: 'position-a',
  amount: 10,
  asset: 'XLM',
  hash: 'hash-a',
  protocol: 'Soroswap',
  status: 'SUCCESS',
  timestamp: 'now',
  openedAt: Date.now(),
  apy: 10,
  category: 'AMM LP',
  poolId: 'pool-a',
  ...overrides,
})

describe('vault voting eligibility', () => {
  it('allows a positive open position belonging to the selected pool', () => {
    expect(isActivePositionForPool(position(), pool)).toBe(true)
    expect(isActivePositionForPool(position({ poolId: 'contract-a' }), pool)).toBe(true)
  })

  it('rejects positions from another pool or without a positive balance', () => {
    expect(isActivePositionForPool(position({ poolId: 'pool-b' }), pool)).toBe(false)
    expect(isActivePositionForPool(position({ amount: 0 }), pool)).toBe(false)
  })

  it.each(['CLOSED', 'WITHDRAWN', 'REMOVED', 'FAILED'])('rejects %s positions', (status) => {
    expect(isActivePositionForPool(position({ status }), pool)).toBe(false)
  })

  it('returns only an eligible position for the selected pool', () => {
    expect(findActivePositionForPool([position({ poolId: 'pool-b' }), position()], pool)?.id).toBe('position-a')
  })
})
