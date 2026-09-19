import { describe, expect, it } from 'vitest'
import { poolSidesForAccount, positionAmountFromPlan, usableNative } from './singleAsset'

const ISSUER = 'GISSUER'

const account = {
  subentry_count: 2,
  balances: [
    { asset_type: 'native', balance: '100.0000000' },
    { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ISSUER, balance: '25.5000000' },
  ],
}

describe('usableNative', () => {
  it('keeps back the account reserve, new trustline reserve, and a fee buffer', () => {
    // (2 + 2) * 0.5 = 2 reserve, 1.5 for new trustlines, 0.05 fees
    expect(usableNative(account)).toBeCloseTo(100 - 2 - 1.5 - 0.05, 6)
  })

  it('never goes negative', () => {
    expect(usableNative({ balances: [{ asset_type: 'native', balance: '1.0' }] })).toBe(0)
  })
})

describe('poolSidesForAccount', () => {
  const reserves = [
    { asset: 'native', amount: '1000' },
    { asset: `USDC:${ISSUER}`, amount: '500' },
  ]

  it('reads the exact issuer, so a same-code asset from another issuer does not count', () => {
    const sides = poolSidesForAccount(reserves, {
      ...account,
      balances: [...account.balances, { asset_code: 'USDC', asset_issuer: 'GOTHER', balance: '999' }],
    })
    expect(sides.map((s) => [s.code, s.balance])).toEqual([
      ['XLM', 100],
      ['USDC', 25.5],
    ])
  })

  it('reports zero for a pool asset the wallet has no line for', () => {
    const sides = poolSidesForAccount([{ asset: `TKN:${ISSUER}`, amount: '1' }], account)
    expect(sides[0].balance).toBe(0)
    expect(sides[0].usable).toBe(0)
  })
})

describe('positionAmountFromPlan', () => {
  const plan = { sourceAsset: 'XLM', destAsset: 'TKN', expectedDepositSource: 50, expectedDepositDest: 4000 }

  it('uses the source side when the pool primary asset is the source', () => {
    expect(positionAmountFromPlan(plan, 'XLM')).toBe(50)
  })

  it('uses the received side when the primary asset is the other one', () => {
    expect(positionAmountFromPlan(plan, 'TKN')).toBe(4000)
  })
})
