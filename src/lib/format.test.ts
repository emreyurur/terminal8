import { describe, it, expect } from 'vitest'
import { truncatePublicKey, formatCurrency, formatSignedCurrency } from './format'

describe('truncatePublicKey', () => {
  it('returns short keys unchanged', () => {
    expect(truncatePublicKey('GABC')).toBe('GABC')
  })

  it('truncates long Stellar public keys to head...tail format', () => {
    const key = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
    const result = truncatePublicKey(key)
    // head(4) + '...' + tail(4)
    expect(result).toMatch(/^.{4}\.{3}.{4}$/)
    expect(result.startsWith('GBBD')).toBe(true)
    expect(result.endsWith(key.slice(-4))).toBe(true)
  })

  it('truncates to exactly 4 + "..." + 4 characters', () => {
    const key = 'GABC123456789DXYZ'
    const result = truncatePublicKey(key)
    expect(result.length).toBe(11) // 4 + 3 + 4
    expect(result).toContain('...')
    expect(result.startsWith('GABC')).toBe(true)
    expect(result.endsWith(key.slice(-4))).toBe(true)
  })
})

describe('formatCurrency', () => {
  it('formats positive numbers as USD', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56')
  })

  it('formats zero as $0.00', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('formats large numbers with commas', () => {
    expect(formatCurrency(1000000)).toBe('$1,000,000.00')
  })

  it('rounds to 2 decimal places', () => {
    expect(formatCurrency(9.999)).toBe('$10.00')
  })
})

describe('formatSignedCurrency', () => {
  it('adds a plus sign to gains', () => {
    expect(formatSignedCurrency(125.5)).toBe('+$125.50')
  })

  it('formats losses with one leading minus sign', () => {
    expect(formatSignedCurrency(-42.25)).toBe('-$42.25')
  })

  it('keeps zero neutral', () => {
    expect(formatSignedCurrency(0)).toBe('$0.00')
  })

  it('supports precision for small PnL values', () => {
    expect(formatSignedCurrency(-0.0008, 4)).toBe('-$0.0008')
  })
})
