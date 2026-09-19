const STROOP = 1e7

/**
 * Converts what the user picked in the withdraw form into LP shares for `liquidityPoolWithdraw`.
 *
 * The form works in position units (the amount recorded when depositing), but the chain wants LP pool
 * shares, which are a different number. So the selection is applied as a ratio to the real on-chain
 * share balance. Selecting the whole position returns the exact balance (no rounding, no over-ask),
 * everything else is floored to a stroop so the request can never exceed what the wallet holds.
 *
 * `onChainShares` is null when the wallet has no LP share line for the pool; the amount is passed through.
 */
export function computeWithdrawShares(
  onChainShares: string | null,
  withdrawAmount: number,
  positionAmount: number,
): number {
  if (!(withdrawAmount > 0)) return 0
  if (onChainShares === null) return withdrawAmount

  const held = Number(onChainShares)
  if (!(held > 0) || !(positionAmount > 0)) return 0

  const ratio = withdrawAmount / positionAmount
  if (ratio >= 0.9999) return held
  return Math.floor(held * ratio * STROOP) / STROOP
}
