import { describe, expect, it } from 'vitest'
import { computeWithdrawShares } from './lpShares'

describe('computeWithdrawShares', () => {
  it('sends the exact on-chain balance on Max, even when the position amount is larger', () => {
    expect(computeWithdrawShares('12.3456789', 100, 100)).toBe(12.3456789)
    expect(computeWithdrawShares('3.5', 250, 250)).toBe(3.5)
  })

  it('applies partial selections as a ratio of the real share balance', () => {
    expect(computeWithdrawShares('10', 50, 100)).toBe(5)
    expect(computeWithdrawShares('10', 25, 100)).toBe(2.5)
  })

  it('never exceeds the balance because of rounding', () => {
    const shares = computeWithdrawShares('1.0000001', 99.99999, 100)
    expect(shares).toBeLessThanOrEqual(1.0000001)
  })

  it('treats a slightly-off Max (float noise) as full', () => {
    expect(computeWithdrawShares('7.7', 99.99999999, 100)).toBe(7.7)
  })

  it('falls back to the typed amount when there is no LP share line on chain', () => {
    expect(computeWithdrawShares(null, 5, 100)).toBe(5)
  })

  it('returns 0 for empty input or zero balance', () => {
    expect(computeWithdrawShares('10', 0, 100)).toBe(0)
    expect(computeWithdrawShares('0', 10, 100)).toBe(0)
  })
})
