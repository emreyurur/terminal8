export type WalletErrorType = 'wallet_not_found' | 'user_rejected' | 'insufficient_balance' | 'unknown'

function getWalletErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error

  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>
    if (typeof value.message === 'string') return value.message
    if (typeof value.reason === 'string') return value.reason
    if (typeof value.error === 'string') return value.error
  }

  return ''
}

export function isWalletCancellationError(error: unknown): boolean {
  const lower = getWalletErrorMessage(error).toLowerCase()

  return [
    'rejected',
    'declined',
    'cancelled',
    'canceled',
    'user closed',
    'user denied',
    'modal closed',
    'closed the modal',
    'window closed',
    'closed by user',
  ].some((phrase) => lower.includes(phrase))
}

export function classifyWalletError(error: unknown): { type: WalletErrorType; message: string } {
  const msg = getWalletErrorMessage(error)
  const lower = msg.toLowerCase()

  if (
    lower.includes('not installed') ||
    lower.includes('not found') ||
    lower.includes('wallet not') ||
    lower.includes('extension') ||
    lower.includes('no wallet') ||
    lower.includes('unavailable')
  ) {
    return {
      type: 'wallet_not_found',
      message: 'Wallet not found. Install Freighter, xBull, or LOBSTR to continue.',
    }
  }

  if (
    isWalletCancellationError(error) ||
    lower.includes('connection error') ||
    lower === 'connection error'
  ) {
    return {
      type: 'user_rejected',
      message: 'User rejected or cancelled the connection request.',
    }
  }

  if (
    lower.includes('insufficient') ||
    lower.includes('underfunded') ||
    lower.includes('balance') ||
    lower.includes('tx_insufficient') ||
    lower.includes('not enough')
  ) {
    return {
      type: 'insufficient_balance',
      message: 'Insufficient balance. Add funds to your wallet and try again.',
    }
  }

  return { type: 'unknown', message: msg || 'Wallet connection failed.' }
}
