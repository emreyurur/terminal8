import { describe, expect, it } from 'vitest'
import { positionFromLpShares } from './positionRecovery'
import type { ApiPool } from '../hooks/usePools'

const apiPool: ApiPool = {
  id: 'pool1',
  feeBp: 30,
  type: 'constant_product',
  totalShares: 1000,
  assetACode: 'XLM',
  assetAIssuer: null,
  reserveA: 5000,
  assetBCode: 'USDC',
  assetBIssuer: 'GISSUER',
  reserveB: 600,
  totalTrustlines: 10,
  lastSyncedAt: '',
  isActive: true,
}

describe('positionFromLpShares', () => {
  it('turns owned shares into the wallet share of the primary asset reserve', () => {
    const pos = positionFromLpShares(100, apiPool, 1_000)
    expect(pos).not.toBeNull()
    expect(pos!.poolId).toBe('pool1')
    expect(pos!.asset).toBe('XLM')
    expect(pos!.amount).toBeCloseTo(500) // 100 / 1000 * 5000
    expect(pos!.status).toBe('RECOVERED')
    expect(pos!.openedAt).toBe(1_000)
  })

  it('returns null for zero shares, empty pools, and dust', () => {
    expect(positionFromLpShares(0, apiPool)).toBeNull()
    expect(positionFromLpShares(5, { ...apiPool, totalShares: 0 })).toBeNull()
    expect(positionFromLpShares(1e-9, apiPool)).toBeNull()
  })
})
