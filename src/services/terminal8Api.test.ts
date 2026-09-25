import { describe, expect, it } from 'vitest'
import { assertTestnetPassphrase, parsePoolRiskResponse, TESTNET_NETWORK_PASSPHRASE } from './terminal8Api'

describe('Testnet network guard', () => {
  it('accepts only the Stellar Testnet passphrase', () => {
    expect(() => assertTestnetPassphrase(TESTNET_NETWORK_PASSPHRASE)).not.toThrow()
    expect(() => assertTestnetPassphrase('Public Global Stellar Network ; September 2015'))
      .toThrow('Terminal8 rejected a non-Testnet transaction.')
  })
})

describe('parsePoolRiskResponse', () => {
  it('maps valid backend health telemetry without changing the values', () => {
    expect(parsePoolRiskResponse({
      poolId: 'pool-1',
      trustScore: '82',
      tvlScore: 74,
      volatilityScore: 68,
      apyScore: 91,
      compositeScore: 79,
      riskLevel: 'low',
      estimatedApy: 328.5,
    })).toEqual({
      poolId: 'pool-1',
      trustScore: 82,
      tvlScore: 74,
      volatilityScore: 68,
      apyScore: 91,
      compositeScore: 79,
      riskLevel: 'LOW',
      estimatedApy: 328.5,
    })
  })

  it('rejects missing or invalid scores instead of inventing fallback values', () => {
    expect(() => parsePoolRiskResponse({
      poolId: 'pool-1',
      trustScore: null,
      tvlScore: 74,
      volatilityScore: 68,
      apyScore: 91,
      compositeScore: 79,
      riskLevel: 'LOW',
    })).toThrow('Invalid pool risk field: trustScore')

    expect(() => parsePoolRiskResponse({
      poolId: 'pool-1',
      trustScore: 82,
      tvlScore: 74,
      volatilityScore: 68,
      apyScore: 91,
      compositeScore: 101,
      riskLevel: 'LOW',
    })).toThrow('Invalid pool risk field: compositeScore')
  })
})
