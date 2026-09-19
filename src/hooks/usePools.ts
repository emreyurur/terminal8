import { useEffect, useState } from 'react'
import { API_BASE } from '../services/terminal8Api'
import type { DeFiPool, PoolReputation, RiskProfile } from '../types/stellar'

// ─── Raw API types ─────────────────────────────────────────────────────────────

export interface ApiPool {
  id: string
  feeBp: number
  type: string
  totalShares: number
  assetACode: string
  assetAIssuer: string | null
  reserveA: number
  assetBCode: string
  assetBIssuer: string | null
  reserveB: number
  totalTrustlines: number
  lastSyncedAt: string
  isActive: boolean
}


// ─── Mapping helpers ───────────────────────────────────────────────────────────

/**
 * Compute a reputation score from on-chain pool data.
 *
 * We derive four sub-scores without any off-chain enrichment:
 *   liquidity (0-40): based on total reserves denominated in "A" units
 *   age       (0-20): always 15 for real pools (we have no creation date)
 *   audit     (0-20): 10 for known protocol tokens, 5 otherwise
 *   activity  (0-20): based on number of trustlines
 */
function deriveReputation(pool: ApiPool): PoolReputation {
  // Liquidity score – log scale capped at 40
  const totalLiquidity = pool.reserveA + pool.reserveB
  const liquidityScore = Math.min(40, Math.round(Math.log10(totalLiquidity + 1) * 5))

  // Age score – placeholder since we don't have creation date from this endpoint
  const ageScore = 15

  // Audit score – known stablecoins & major assets get a higher score
  const knownAssets = ['XLM', 'USDC', 'AQUA', 'yXLM', 'BTC', 'ETH', 'EURC']
  const aKnown = knownAssets.includes(pool.assetACode)
  const bKnown = knownAssets.includes(pool.assetBCode)
  const auditScore = aKnown && bKnown ? 20 : aKnown || bKnown ? 14 : 8

  // Activity score – based on trustlines (more = more active community)
  const activityScore = Math.min(20, Math.max(4, pool.totalTrustlines * 4))

  return {
    liquidity: liquidityScore,
    age: ageScore,
    audit: auditScore,
    activity: activityScore,
  }
}

function deriveRisk(reputation: PoolReputation): RiskProfile {
  const total = reputation.liquidity + reputation.age + reputation.audit + reputation.activity
  if (total >= 70) return 'Conservative'
  if (total >= 50) return 'Moderate'
  return 'Aggressive'
}

/**
 * Format a raw reserve number into a human-friendly TVL string.
 * We use the larger reserve as the TVL proxy (usually the stablecoin side).
 */
function formatTvl(reserveA?: number, reserveB?: number): { tvl: string; tvlRaw: number } {
  const tvlRaw = (Number(reserveA) || 0) + (Number(reserveB) || 0)
  if (tvlRaw >= 1_000_000_000) {
    const bVal = (tvlRaw / 1_000_000_000).toFixed(3).replace(/\.?0+$/, '')
    return { tvl: `$${bVal}B`, tvlRaw }
  }
  if (tvlRaw >= 1_000_000) {
    const mVal = (tvlRaw / 1_000_000).toFixed(2).replace(/\.?0+$/, '')
    return { tvl: `$${mVal}M`, tvlRaw }
  }
  if (tvlRaw >= 1_000) {
    const kVal = (tvlRaw / 1_000).toFixed(1).replace(/\.?0+$/, '')
    return { tvl: `$${kVal}K`, tvlRaw }
  }
  return { tvl: `$${tvlRaw.toFixed(0)}`, tvlRaw }
}

function estimateApy(pool: ApiPool): number {
  const feeBp = Number.isFinite(Number(pool.feeBp)) ? Number(pool.feeBp) : 30
  const feePct = feeBp / 100
  const trustlines = Number.isFinite(Number(pool.totalTrustlines)) ? Number(pool.totalTrustlines) : 10
  const volumeRatio = Math.min(3, 0.5 + trustlines * 0.3)
  return parseFloat((feePct * 365 * volumeRatio).toFixed(1))
}

export function mapApiPoolToDeFiPool(pool: ApiPool): DeFiPool {
  const reputation = deriveReputation(pool)
  const risk = deriveRisk(reputation)
  const { tvl, tvlRaw } = formatTvl(pool.reserveA, pool.reserveB)
  const apy = estimateApy(pool)

  let assetA = pool.assetACode || 'XLM'
  let assetB = pool.assetBCode || 'USDC'
  let resA = Number(pool.reserveA) || 0
  let resB = Number(pool.reserveB) || 0
  if (assetA === 'XLM' && assetB !== 'USDC' && assetB !== 'EURC' && assetB !== 'XLM') {
    assetA = pool.assetBCode || 'USDC'
    assetB = pool.assetACode || 'XLM'
    resA = Number(pool.reserveB) || 0
    resB = Number(pool.reserveA) || 0
  } else if (assetB === 'XLM' && (assetA === 'USDC' || assetA === 'EURC')) {
    assetA = pool.assetBCode
    assetB = pool.assetACode || 'USDC'
    resA = Number(pool.reserveB) || 0
    resB = Number(pool.reserveA) || 0
  }

  const feeBpSafe = Number.isFinite(Number(pool.feeBp)) ? Number(pool.feeBp) : 30

  return {
    id: pool.id || `pool_${Date.now()}`,
    protocol: 'Soroswap AMM',
    category: 'AMM LP',
    asset: assetA,
    secondaryAsset: assetB,
    apy,
    tvl,
    tvlRaw,
    volume24h: '—',
    reserveA: resA,
    reserveB: resB,
    reputation,
    risk,
    method: 'addLiquidity()',
    rationale: `Add liquidity to the ${assetA} / ${assetB} pool and earn ${(feeBpSafe / 100).toFixed(2)}% swap fees.`,
    contractId: pool.id ? pool.id.slice(0, 8) + '…' + pool.id.slice(-6) : 'SoroswapPool',
    feeBp: feeBpSafe,
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export type PoolsState =
  | { status: 'loading' }
  | { status: 'success'; pools: DeFiPool[] }
  | { status: 'error'; message: string }


export function usePools(publicKey?: string | null): PoolsState {
  const [state, setState] = useState<PoolsState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function fetchPools() {
      try {
        const allPoolsUrl = `${API_BASE}api/v1/pools?page=1&limit=50`
        const recommendedUrl = publicKey
          ? `${API_BASE}api/v1/pools/recommended/${encodeURIComponent(publicKey)}?page=1&limit=15`
          : null

        const [listRes, recRes] = await Promise.allSettled([
          fetch(allPoolsUrl, { headers: { accept: '*/*' } }),
          recommendedUrl ? fetch(recommendedUrl, { headers: { accept: '*/*' } }) : Promise.reject('No public key'),
        ])

        if (listRes.status === 'rejected' || !listRes.value.ok) {
          throw new Error('API returned error')
        }

        const json = await listRes.value.json()
        const rawList: ApiPool[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []

        if (!cancelled) {
          const recPools: ApiPool[] = []
          if (recRes.status === 'fulfilled' && recRes.value && recRes.value.ok) {
            const recJson = await recRes.value.json()
            const recList = Array.isArray(recJson?.data) ? recJson.data : Array.isArray(recJson) ? recJson : []
            if (recList.length > 0) {
              recPools.push(...recList.filter((p: ApiPool) => p.isActive !== false))
            }
          }

          const recIds = new Set(recPools.map((p) => p.id))
          const restPools = rawList.filter((p) => !recIds.has(p.id) && p.isActive !== false)

          restPools.sort((a, b) => {
            const liqA = (Number(a.reserveA) || 0) + (Number(a.reserveB) || 0)
            const liqB = (Number(b.reserveA) || 0) + (Number(b.reserveB) || 0)
            return liqB - liqA
          })
          const top15Liquidity = restPools.slice(0, 15)

          const allRaw = [...recPools, ...top15Liquidity]
          const pools = allRaw.map(mapApiPoolToDeFiPool)

          setState({ status: 'success', pools })
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to load pools',
          })
        }
      }
    }

    fetchPools()
    return () => { cancelled = true }
  }, [publicKey])

  return state
}
