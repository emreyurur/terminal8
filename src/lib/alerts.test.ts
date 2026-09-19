import { describe, expect, it } from 'vitest'
import { alertSummary, allowedConditions, formatAlertValue, formatNumber, isValidEmail, isValidPoolId } from './alerts'

const base = { threshold: 0.5, quoteSide: 'A' as const, codeA: 'XLM', codeB: 'USDC' }

describe('alert helpers', () => {
  it('summarises alerts in plain words', () => {
    expect(alertSummary({ ...base, metric: 'PRICE', condition: 'ABOVE' })).toBe('1 USDC price ≥ 0.5000 XLM')
    expect(alertSummary({ ...base, quoteSide: 'B', metric: 'PRICE', condition: 'BELOW', threshold: 2 })).toBe(
      '1 XLM price ≤ 2 USDC',
    )
    expect(alertSummary({ ...base, metric: 'POSITION_VALUE', condition: 'BELOW', threshold: 1500 })).toBe(
      'Position value ≤ 1,500 XLM',
    )
    expect(alertSummary({ ...base, metric: 'IMPERMANENT_LOSS_PCT', condition: 'ABOVE', threshold: 5 })).toBe(
      'Impermanent loss ≥ 5%',
    )
  })

  it('formats values and missing values', () => {
    expect(formatAlertValue({ ...base, metric: 'PRICE', condition: 'ABOVE' }, 0.94644)).toBe('0.9464 XLM')
    expect(formatAlertValue({ ...base, metric: 'IMPERMANENT_LOSS_PCT', condition: 'ABOVE' }, 12.5)).toBe('12.5%')
    expect(formatAlertValue({ ...base, metric: 'PRICE', condition: 'ABOVE' }, null)).toBe('—')
    expect(formatNumber(Number.NaN)).toBe('—')
  })

  it('only allows rising-above for impermanent loss', () => {
    expect(allowedConditions('IMPERMANENT_LOSS_PCT')).toEqual(['ABOVE'])
    expect(allowedConditions('PRICE')).toEqual(['ABOVE', 'BELOW'])
  })

  it('validates pool ids and emails', () => {
    expect(isValidPoolId('a'.repeat(64))).toBe(true)
    expect(isValidPoolId(` ${'B'.repeat(64)} `)).toBe(true)
    expect(isValidPoolId('abc')).toBe(false)
    expect(isValidEmail('me@example.com')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
  })
})
