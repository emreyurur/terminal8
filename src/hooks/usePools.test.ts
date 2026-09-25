import { describe, expect, it } from 'vitest'
import { mapApiPoolToDeFiPool, prioritizeXlmPool, type ApiPool } from './usePools'

function pool(id: string, assetACode: string, assetBCode: string): ApiPool {
  return {
    id,
    assetACode,
    assetAIssuer: null,
    assetBCode,
    assetBIssuer: null,
    feeBp: 30,
    isActive: true,
    lastSyncedAt: '2026-09-25T00:00:00.000Z',
    reserveA: 100,
    reserveB: 100,
    totalShares: 100,
    totalTrustlines: 1,
    type: 'constant_product',
  }
}

describe('prioritizeXlmPool', () => {
  it('keeps an XLM pool inside a limited pool result', () => {
    const pools = [
      pool('one', 'USDC', 'EURC'),
      pool('two', 'AQUA', 'USDC'),
      pool('xlm', 'XLM', 'USDC'),
    ]

    expect(prioritizeXlmPool(pools, 2).map((item) => item.id)).toEqual(['xlm', 'one'])
  })

  it('preserves order when the limited result already contains XLM', () => {
    const pools = [pool('one', 'USDC', 'XLM'), pool('two', 'AQUA', 'USDC')]

    expect(prioritizeXlmPool(pools, 2).map((item) => item.id)).toEqual(['one', 'two'])
  })
})

describe('mapApiPoolToDeFiPool', () => {
  it('uses live dashboard and risk metrics without frontend estimates', () => {
    const mapped = mapApiPoolToDeFiPool(pool('xlm-usdc', 'XLM', 'USDC'), {
      dashboard: {
        vaultOverview: {
          totalSupplied: 2_783_880.25,
          totalBorrowed: 0,
          utilization: 24.05,
          supplyApy: 26.3364,
          supplyApy90dAvg: 26.3364,
        },
      },
      risk: {
        poolId: 'xlm-usdc',
        trustScore: 60,
        tvlScore: 100,
        volatilityScore: 50,
        apyScore: 100,
        compositeScore: 78,
        riskLevel: 'LOW',
        estimatedApy: 0.301,
      },
    })

    expect(mapped.apy).toBe(26.3364)
    expect(mapped.tvlRaw).toBe(2_783_880.25)
    expect(mapped.tvl).toBe('$2.78M')
    expect(mapped.trustScore).toBe(60)
    expect(mapped.compositeScore).toBe(78)
    expect(mapped.risk).toBe('Conservative')
    expect(mapped.apyAvailable).toBe(true)
    expect(mapped.depositsAvailable).toBe(true)
    expect(mapped.riskDataAvailable).toBe(true)
  })

  it('does not fabricate display metrics when enrichment endpoints fail', () => {
    const mapped = mapApiPoolToDeFiPool(pool('missing-metrics', 'AQUA', 'USDC'))

    expect(mapped.apyAvailable).toBe(false)
    expect(mapped.depositsAvailable).toBe(false)
    expect(mapped.riskDataAvailable).toBe(false)
    expect(mapped.tvl).toBe('--')
    expect(mapped.trustScore).toBeUndefined()
  })
})
