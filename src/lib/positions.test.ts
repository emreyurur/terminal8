import { describe, expect, it } from 'vitest'
import { addPosition, mergePositionsByPool } from './positions'
import type { LocalPosition } from '../types/stellar'

const pos = (over: Partial<LocalPosition>): LocalPosition => ({
  id: 'a',
  amount: 1,
  asset: 'XLM',
  hash: 'h',
  protocol: 'Soroswap AMM',
  status: 'SUCCESS',
  timestamp: '',
  openedAt: 1000,
  apy: 4,
  category: 'AMM LP',
  poolId: 'pool1',
  ...over,
})

describe('mergePositionsByPool', () => {
  it('merges repeated deposits into one position and sums the amount', () => {
    const out = mergePositionsByPool([pos({ id: 'new', amount: 0.01 }), pos({ id: 'old', amount: 2.1 })])
    expect(out).toHaveLength(1)
    expect(out[0].amount).toBeCloseTo(2.11)
    expect(out[0].id).toBe('new')
  })

  it('keeps different pools separate', () => {
    const out = mergePositionsByPool([pos({ poolId: 'p1' }), pos({ id: 'b', poolId: 'p2' })])
    expect(out).toHaveLength(2)
  })

  it('weights openedAt and apy by amount', () => {
    const out = mergePositionsByPool([
      pos({ id: 'n', amount: 1, openedAt: 2000, apy: 10 }),
      pos({ id: 'o', amount: 3, openedAt: 1000, apy: 2 }),
    ])
    expect(out[0].openedAt).toBe(1250)
    expect(out[0].apy).toBeCloseTo(4)
  })

  it('leaves positions without a pool id alone', () => {
    const out = mergePositionsByPool([pos({ poolId: '' }), pos({ id: 'b', poolId: '' })])
    expect(out).toHaveLength(2)
  })
})

describe('addPosition', () => {
  it('puts a new deposit on top of the existing position of the same pool', () => {
    const out = addPosition([pos({ id: 'old', amount: 2 })], pos({ id: 'new', amount: 3 }))
    expect(out).toHaveLength(1)
    expect(out[0].amount).toBe(5)
  })
})
