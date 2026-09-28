export function truncatePublicKey(publicKey: string) {
  if (publicKey.length <= 12) {
    return publicKey
  }

  return `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatSignedCurrency(value: number, decimals = 2) {
  const normalizedValue = Number.isFinite(value) ? value : 0
  const sign = normalizedValue > 0 ? '+' : normalizedValue < 0 ? '-' : ''
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(normalizedValue))

  return `${sign}${amount}`
}

