import { useEffect, useState } from 'react'
import {
  API_BASE,
  HORIZON_URL,
  fetchPoolDashboard,
  fetchPoolRisk,
  type PoolDashboardResponse,
  type PoolRiskResponse,
} from '../services/terminal8Api'
import type { DeFiPool, PoolReputation, RiskProfile } from '../types/stellar'

export interface ApiPool {
  id: string
  feeBp: number
  type: string
  totalShares: number | string
  assetACode: string
  assetAIssuer: string | null
  reserveA: number | string
  assetBCode: string
  assetBIssuer: string | null
  reserveB: number | string
  totalTrustlines: number
  lastSyncedAt: string
  isActive: boolean
}

function mapRiskToReputation(risk?: PoolRiskResponse): PoolReputation {
  return {
    liquidity: Math.round((Number(risk?.tvlScore) || 0) * 0.4),
    age: Math.round((Number(risk?.volatilityScore) || 0) * 0.2),
    audit: Math.round((Number(risk?.trustScore) || 0) * 0.2),
    activity: Math.round((Number(risk?.apyScore) || 0) * 0.2),
  }
}

function mapRiskLevel(level?: string): RiskProfile {
  const normalized = level?.toUpperCase()
  if (normalized === 'LOW') return 'Conservative'
  if (normalized === 'HIGH') return 'Aggressive'
  return 'Moderate'
}

function formatUsdCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: value >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1_000 ? 2 : 0,
  }).format(value)
}

function isXlmPool(pool: ApiPool): boolean {
  return pool.assetACode?.toUpperCase() === 'XLM' || pool.assetBCode?.toUpperCase() === 'XLM'
}

export function prioritizeXlmPool(pools: ApiPool[], limit: number): ApiPool[] {
  const limited = pools.slice(0, limit)
  if (limited.some(isXlmPool)) return limited

  const xlmPool = pools.find(isXlmPool)
  return xlmPool ? [xlmPool, ...limited.slice(0, Math.max(0, limit - 1))] : limited
}

const testnetPoolChecks = new Map<string, Promise<boolean>>()

function isTestnetPool(poolId: string): Promise<boolean> {
  const existing = testnetPoolChecks.get(poolId)
  if (existing) return existing

  const check = fetch(`${HORIZON_URL}/liquidity_pools/${encodeURIComponent(poolId)}`)
    .then((response) => response.ok)
    .catch(() => false)
  testnetPoolChecks.set(poolId, check)
  return check
}

async function keepTestnetPools(pools: ApiPool[]): Promise<ApiPool[]> {
  const checks = await Promise.allSettled(pools.map(async (pool) => {
    return await isTestnetPool(pool.id) ? pool : null
  }))

  return checks.flatMap((result) => (
    result.status === 'fulfilled' && result.value ? [result.value] : []
  ))
}

export function mapApiPoolToDeFiPool(
  pool: ApiPool,
  metrics: { risk?: PoolRiskResponse; dashboard?: PoolDashboardResponse } = {},
): DeFiPool {
  const supplied = Number(metrics.dashboard?.vaultOverview?.totalSupplied)
  const depositsAvailable = Number.isFinite(supplied)
  const dashboardApy = Number(metrics.dashboard?.vaultOverview?.supplyApy)
  const estimatedApy = Number(metrics.risk?.estimatedApy)
  const apyAvailable = Number.isFinite(dashboardApy) || Number.isFinite(estimatedApy)
  const apy = Number.isFinite(dashboardApy)
    ? dashboardApy
    : Number.isFinite(estimatedApy) ? estimatedApy : 0
  const trustScore = Number(metrics.risk?.trustScore)
  const compositeScore = Number(metrics.risk?.compositeScore)

  let assetA = pool.assetACode || 'XLM'
  let assetB = pool.assetBCode || 'USDC'
  let reserveA = Number(pool.reserveA) || 0
  let reserveB = Number(pool.reserveB) || 0

  if (assetA === 'XLM' && assetB !== 'USDC' && assetB !== 'EURC' && assetB !== 'XLM') {
    assetA = pool.assetBCode || 'USDC'
    assetB = pool.assetACode || 'XLM'
    reserveA = Number(pool.reserveB) || 0
    reserveB = Number(pool.reserveA) || 0
  } else if (assetB === 'XLM' && (assetA === 'USDC' || assetA === 'EURC')) {
    assetA = pool.assetBCode
    assetB = pool.assetACode || 'USDC'
    reserveA = Number(pool.reserveB) || 0
    reserveB = Number(pool.reserveA) || 0
  }

  const feeBp = Number.isFinite(Number(pool.feeBp)) ? Number(pool.feeBp) : 30

  return {
    id: pool.id,
    protocol: 'Soroswap AMM',
    category: 'AMM LP',
    asset: assetA,
    secondaryAsset: assetB,
    apy,
    apyAvailable,
    tvl: depositsAvailable ? formatUsdCompact(supplied) : '--',
    tvlRaw: depositsAvailable ? supplied : 0,
    depositsAvailable,
    utilization: Number.isFinite(Number(metrics.dashboard?.vaultOverview?.utilization))
      ? Number(metrics.dashboard?.vaultOverview?.utilization)
      : undefined,
    volume24h: '-',
    reserveA,
    reserveB,
    reputation: mapRiskToReputation(metrics.risk),
    risk: mapRiskLevel(metrics.risk?.riskLevel),
    riskDataAvailable: Boolean(metrics.risk),
    trustScore: Number.isFinite(trustScore) ? trustScore : undefined,
    compositeScore: Number.isFinite(compositeScore) ? compositeScore : undefined,
    method: 'addLiquidity()',
    rationale: `Add liquidity to the ${assetA} / ${assetB} pool and earn ${(feeBp / 100).toFixed(2)}% swap fees.`,
    contractId: pool.id,
    feeBp,
  }
}

export type PoolsState =
  | { status: 'loading' }
  | { status: 'success'; pools: DeFiPool[] }
  | { status: 'error'; message: string }

export function usePools(publicKey?: string | null): PoolsState {
  const [state, setState] = useState<PoolsState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function fetchPools() {
      try {
        const allPoolsUrl = `${API_BASE}api/v1/pools?page=1&limit=50`
        const recommendedUrl = publicKey
          ? `${API_BASE}api/v1/pools/recommended/${encodeURIComponent(publicKey)}?page=1&limit=15`
          : null

        const [listResult, recommendedResult] = await Promise.allSettled([
          fetch(allPoolsUrl, { headers: { accept: 'application/json' }, signal: controller.signal }),
          recommendedUrl
            ? fetch(recommendedUrl, { headers: { accept: 'application/json' }, signal: controller.signal })
            : Promise.reject(new Error('No connected wallet')),
        ])

        if (listResult.status === 'rejected' || !listResult.value.ok) {
          throw new Error('Pool API returned an error')
        }

        const listJson = await listResult.value.json()
        const rawList: ApiPool[] = Array.isArray(listJson?.data)
          ? listJson.data
          : Array.isArray(listJson) ? listJson : []
        const recommendedPools: ApiPool[] = []

        if (recommendedResult.status === 'fulfilled' && recommendedResult.value.ok) {
          const recommendedJson = await recommendedResult.value.json()
          const recommendedList = Array.isArray(recommendedJson?.data)
            ? recommendedJson.data
            : Array.isArray(recommendedJson) ? recommendedJson : []
          recommendedPools.push(...recommendedList.filter((pool: ApiPool) => pool.isActive !== false))
        }

        const recommendedIds = new Set(recommendedPools.map((pool) => pool.id))
        const remainingPools = rawList.filter(
          (pool) => pool.isActive !== false && !recommendedIds.has(pool.id),
        )
        remainingPools.sort((a, b) => {
          const liquidityA = (Number(a.reserveA) || 0) + (Number(a.reserveB) || 0)
          const liquidityB = (Number(b.reserveA) || 0) + (Number(b.reserveB) || 0)
          return liquidityB - liquidityA
        })

        const candidates = prioritizeXlmPool([...recommendedPools, ...remainingPools], 15)
        const selectedPools = await keepTestnetPools(candidates)
        if (candidates.length > 0 && selectedPools.length === 0) {
          throw new Error('Pool API returned no pools available on Stellar Testnet')
        }
        const pools = await Promise.all(selectedPools.map(async (pool) => {
          const [riskResult, dashboardResult] = await Promise.allSettled([
            fetchPoolRisk(pool.id, controller.signal),
            fetchPoolDashboard(pool.id, controller.signal),
          ])

          return mapApiPoolToDeFiPool(pool, {
            risk: riskResult.status === 'fulfilled' ? riskResult.value : undefined,
            dashboard: dashboardResult.status === 'fulfilled' ? dashboardResult.value : undefined,
          })
        }))

        if (!cancelled) setState({ status: 'success', pools })
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load pools',
          })
        }
      }
    }

    void fetchPools()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [publicKey])

  return state
}
