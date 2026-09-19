import { mapApiPoolToDeFiPool, type ApiPool } from '../hooks/usePools'
import { API_BASE } from './terminal8Api'
import type { LocalPosition } from '../types/stellar'

// Anything smaller is dust left over from rounding, not a position worth listing.
const MIN_AMOUNT = 1e-6

/**
 * Builds a Home "active position" from an LP share balance held on chain.
 * `amount` is the share of the pool's primary asset the wallet owns (shares / totalShares * reserve).
 */
export function positionFromLpShares(shares: number, apiPool: ApiPool, now = Date.now()): LocalPosition | null {
  const totalShares = Number(apiPool.totalShares)
  if (!(shares > 0) || !(totalShares > 0)) return null

  const pool = mapApiPoolToDeFiPool(apiPool)
  const amount = (shares / totalShares) * (Number(pool.reserveA) || 0)
  if (!(amount >= MIN_AMOUNT)) return null

  return {
    id: `recovered-${apiPool.id}`,
    amount,
    asset: pool.asset,
    hash: '',
    protocol: pool.protocol,
    status: 'RECOVERED',
    timestamp: new Date(now).toLocaleTimeString(),
    // The real deposit time is unknown here, so the yield clock restarts from now.
    openedAt: now,
    apy: pool.apy,
    category: pool.category,
    poolId: apiPool.id,
  }
}

/**
 * Rebuilds positions for pools where the wallet holds LP shares on chain but the browser has no record
 * (new device, cleared storage). Needs no login: Horizon and the public pool endpoint are enough.
 * Pools listed in `knownPoolIds` are skipped, local records stay the source of truth for them.
 */
export async function recoverLpPositions(
  horizonUrl: string,
  publicKey: string,
  knownPoolIds: Set<string>,
  signal?: AbortSignal,
): Promise<LocalPosition[]> {
  const res = await fetch(`${horizonUrl.replace(/\/$/, '')}/accounts/${publicKey}`, { signal })
  if (!res.ok) return []
  const account = (await res.json()) as { balances: { liquidity_pool_id?: string; balance: string }[] }

  const held = account.balances.filter(
    (b) => b.liquidity_pool_id && Number(b.balance) > 0 && !knownPoolIds.has(b.liquidity_pool_id),
  )

  const recovered = await Promise.all(
    held.map(async (b) => {
      try {
        const poolRes = await fetch(`${API_BASE}api/v1/pools/${b.liquidity_pool_id}`, { signal })
        if (!poolRes.ok) return null
        return positionFromLpShares(Number(b.balance), (await poolRes.json()) as ApiPool)
      } catch {
        return null
      }
    }),
  )

  return recovered.filter((p): p is LocalPosition => p !== null)
}
