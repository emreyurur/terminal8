import { describe, it, expect } from 'vitest'
import { classifyWalletError, isWalletCancellationError } from '../lib/walletErrors'

describe('classifyWalletError', () => {
  it('classifies wallet-not-found errors', () => {
    const result = classifyWalletError(new Error('Wallet not installed'))
    expect(result.type).toBe('wallet_not_found')
    expect(result.message).toContain('Install Freighter')
  })

  it('classifies user-rejected errors', () => {
    const result = classifyWalletError(new Error('User rejected the request'))
    expect(result.type).toBe('user_rejected')
    expect(result.message).toContain('rejected')
  })

  it('classifies insufficient balance errors', () => {
    const result = classifyWalletError(new Error('Insufficient balance in account'))
    expect(result.type).toBe('insufficient_balance')
    expect(result.message).toContain('balance')
  })

  it('classifies unknown errors with the original message', () => {
    const result = classifyWalletError(new Error('Something completely unexpected'))
    expect(result.type).toBe('unknown')
    expect(result.message).toBe('Something completely unexpected')
  })

  it('handles string errors', () => {
    const result = classifyWalletError('modal closed')
    expect(result.type).toBe('user_rejected')
  })

  it('handles the wallet kit modal-close object', () => {
    const error = { code: -1, message: 'The user closed the modal.' }

    expect(isWalletCancellationError(error)).toBe(true)
    expect(classifyWalletError(error).type).toBe('user_rejected')
  })

  it('extracts messages from plain wallet error objects', () => {
    const result = classifyWalletError({ code: -2, message: 'Unexpected provider failure' })

    expect(result.type).toBe('unknown')
    expect(result.message).toBe('Unexpected provider failure')
  })

  it('handles underfunded as insufficient balance', () => {
    const result = classifyWalletError(new Error('tx_insufficient_balance: account underfunded'))
    expect(result.type).toBe('insufficient_balance')
  })

  it('handles extension unavailable', () => {
    const result = classifyWalletError(new Error('Extension unavailable'))
    expect(result.type).toBe('wallet_not_found')
  })
})
