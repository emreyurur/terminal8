const BASE_RESERVE = 0.5
// The single-asset deposit may open two trustlines (1 + 2 subentries) and pays fees for a few operations.
const NEW_TRUSTLINE_RESERVE = 3 * BASE_RESERVE
const FEE_BUFFER = 0.05

export type PoolSide = {
  /** Asset code, XLM for native. */
  code: string
  /** 'native' or CODE:ISSUER, the same key Horizon uses for pool reserves. */
  key: string
  isNative: boolean
  /** What the wallet holds. */
  balance: number
  /** What can actually be put into the pool (reserves and fees excluded). */
  usable: number
}

type HorizonBalance = { asset_type?: string; asset_code?: string; asset_issuer?: string; balance: string; selling_liabilities?: string }
type HorizonAccount = { balances: HorizonBalance[]; subentry_count?: number; num_sponsoring?: number; num_sponsored?: number }
type HorizonReserve = { asset: string; amount: string }

/** XLM that can be spent after the account reserve, the reserve for new trustlines, and fees. */
export function usableNative(account: HorizonAccount): number {
  const line = account.balances.find((b) => b.asset_type === 'native')
  const balance = Number(line?.balance ?? 0)
  const selling = Number(line?.selling_liabilities ?? 0)
  const entries =
    2 + Number(account.subentry_count ?? 0) + Number(account.num_sponsoring ?? 0) - Number(account.num_sponsored ?? 0)
  return Math.max(0, balance - selling - entries * BASE_RESERVE - NEW_TRUSTLINE_RESERVE - FEE_BUFFER)
}

/** Maps a pool's two reserves to what the wallet holds of each asset. */
export function poolSidesForAccount(reserves: HorizonReserve[], account: HorizonAccount): PoolSide[] {
  return reserves.map((r) => {
    if (r.asset === 'native') {
      const balance = Number(account.balances.find((b) => b.asset_type === 'native')?.balance ?? 0)
      return { code: 'XLM', key: 'native', isNative: true, balance, usable: usableNative(account) }
    }
    const [code, issuer] = r.asset.split(':')
    const line = account.balances.find((b) => b.asset_code === code && b.asset_issuer === issuer)
    const balance = Number(line?.balance ?? 0)
    const selling = Number(line?.selling_liabilities ?? 0)
    return { code, key: r.asset, isNative: false, balance, usable: Math.max(0, balance - selling) }
  })
}

/** Position amount in the pool's primary asset, from a single-asset plan. */
export function positionAmountFromPlan(
  plan: { sourceAsset: string; destAsset: string; expectedDepositSource: number; expectedDepositDest: number },
  primaryAsset: string,
): number {
  const assetCode = (asset: string) => {
    const code = asset.toLowerCase() === 'native' ? 'XLM' : asset.split(':')[0]
    return code.toUpperCase()
  }
  const amount = assetCode(plan.sourceAsset) === assetCode(primaryAsset)
    ? plan.expectedDepositSource
    : plan.expectedDepositDest
  const numericAmount = Number(amount)
  return Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount : 0
}
