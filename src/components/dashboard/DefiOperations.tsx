import { Component, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, Info, Search, X } from 'lucide-react'
import xlmLogo from '../../assets/xlm.svg'
import usdcLogo from '../../assets/usdc.svg'
import aquaLogo from '../../assets/aquaris.svg'
import { useWallet } from '../../context/useWallet'
import { classifyWalletError } from '../../lib/walletErrors'
import { estimateSecondaryAmount } from '../../services/soroswapLiquidity'
import { executeApiPoolTransaction } from '../../services/terminal8Api'
import { signTransaction } from '@stellar/freighter-api'
import { usePortfolioDashboard } from '../../hooks/usePortfolioDashboard'
import type { DeFiPool, LocalPosition, RiskProfile, WalletBalance } from '../../types/stellar'
import { usePools } from '../../hooks/usePools'
import { usePoolRisk } from '../../hooks/usePoolRisk'
import { PoolDetailsView } from './PoolDetailsView'

class SafeErrorBoundary extends Component<{ onReset: () => void; children: ReactNode }, { hasError: boolean; errorMessage: string; errorStack: string }> {
  constructor(props: { onReset: () => void; children: ReactNode }) {
    super(props)
    this.state = { hasError: false, errorMessage: '', errorStack: '' }
  }
  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack || '' : '',
    }
  }
  componentDidCatch(error: Error) {
    console.error('PoolDetailsView crashed:', error)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-red-500/30 bg-[#111119] p-8 text-center">
          <p className="text-lg font-bold text-red-400">Unable to display pool details</p>
          <p className="mt-2 text-sm font-mono text-white">{this.state.errorMessage}</p>
          {this.state.errorStack && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-left text-xs text-[#9CA3AF]">
              {this.state.errorStack}
            </pre>
          )}
          <button
            onClick={() => {
              this.setState({ hasError: false, errorMessage: '', errorStack: '' })
              this.props.onReset()
            }}
            className="mt-6 rounded-xl bg-[#F2C12E] px-6 py-2.5 text-xs font-bold text-[#0D0D12]"
            type="button"
          >
            ← Back to Overview
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function getNowTimestamp(): number {
  return Date.now()
}

const XLM_TESTNET_GUIDE_COMPLETED_KEY = 'terminal8_xlm_testnet_guide_completed_v1'

function hasCompletedXlmTestnetGuide(): boolean {
  try {
    return localStorage.getItem(XLM_TESTNET_GUIDE_COMPLETED_KEY) === '1'
  } catch {
    return false
  }
}

function formatUsd(val: number | string): string {
  const num = Number(val) || 0
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatAmount(val: number | string, decimals = 2): string {
  const num = Number(val) || 0
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function formatTokenAmount(val: number | string): string {
  const num = Number(val) || 0
  if (num > 0 && num < 0.01) return '<0.01'
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatEarnedUsd(val: number): string {
  if (val > 0 && val < 0.01) return '<$0.01'
  return `+$${formatUsd(val)}`
}

function healthScoreLabel(score: number): 'Trusted' | 'Moderate' | 'Risky' {
  if (score >= 75) return 'Trusted'
  if (score >= 50) return 'Moderate'
  return 'Risky'
}

// ─── Token Avatars Helper ────────────────────────────────────────────────────────
const TOKEN_COLORS: Record<string, string> = {
  XLM: '#3b82f6',
  USDC: '#10b981',
  AQUA: '#06b6d4',
  BTC: '#f59e0b',
  ETH: '#8b5cf6',
  EURC: '#6366f1',
  YRK: '#f59e0b',
}

function tokenBg(code: string): string {
  if (TOKEN_COLORS[code]) return TOKEN_COLORS[code]
  const palette = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) & 0xfff
  return palette[h % palette.length]
}

function TokenAvatar({ code = 'XLM' }: { code?: string; size?: string }) {
  const safeCode = typeof code === 'string' && code ? code : 'XLM'
  const upper = safeCode.toUpperCase()
  if (upper === 'XLM' || upper === 'YXLM') {
    return (
      <img
        alt={code}
        className="size-7 shrink-0 rounded-full bg-[#12121A] p-0.5 ring-2 ring-[#0D0D12]"
        src={xlmLogo}
      />
    )
  }
  if (upper === 'USDC') {
    return (
      <img
        alt={code}
        className="size-7 shrink-0 rounded-full bg-[#12121A] p-0.5 ring-2 ring-[#0D0D12]"
        src={usdcLogo}
      />
    )
  }
  if (upper === 'AQUA') {
    return (
      <img
        alt={code}
        className="size-7 shrink-0 rounded-full bg-[#12121A] p-0.5 ring-2 ring-[#0D0D12]"
        src={aquaLogo}
      />
    )
  }

  return (
    <div
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-white shadow-inner ring-2 ring-[#0D0D12]"
      style={{ backgroundColor: tokenBg(code) }}
      title={code}
    >
      <svg className="size-3.5 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    </div>
  )
}

function findMatchingPool(pos: LocalPosition, allKnownPools: DeFiPool[], fallbackPool: DeFiPool): DeFiPool {
  if (!pos) return fallbackPool

  // 1. Exact ID or Contract ID match
  if (pos.poolId && pos.poolId.trim() !== '') {
    const cleanId = pos.poolId.trim().toLowerCase()
    const exactMatch = allKnownPools.find((p) => {
      const pId = (p.id || '').toLowerCase()
      const pContract = (p.contractId || '').toLowerCase()
      return pId === cleanId || pContract === cleanId || (cleanId.length > 8 && (pId.includes(cleanId) || cleanId.includes(pId) || pContract.includes(cleanId) || cleanId.includes(pContract)))
    })
    if (exactMatch) return exactMatch
  }

  // 2. Pair / Asset symbol exact check
  const posAssetClean = (pos.asset || '').trim().toUpperCase()
  if (posAssetClean && posAssetClean !== 'XLM' && posAssetClean !== 'USDC') {
    const tokenParts = posAssetClean.split('/').map((t) => t.trim())
    const targetToken = tokenParts.find((t) => t !== 'XLM' && t !== 'USDC') || posAssetClean

    const symbolMatch = allKnownPools.find((p) => {
      const pAsset = (p.asset || '').toUpperCase()
      const pSec = (p.secondaryAsset || '').toUpperCase()
      return pAsset === targetToken || pSec === targetToken || `${pAsset}/${pSec}` === posAssetClean || `${pSec}/${pAsset}` === posAssetClean
    })
    if (symbolMatch) return symbolMatch
  }

  // 3. If pos is YRK or terminal specifically or XLM/YRK
  if (posAssetClean.includes('YRK') || (pos.poolId && pos.poolId.toLowerCase().includes('yrk'))) {
    const yrkPool = allKnownPools.find((p) => (p.asset || '').toUpperCase() === 'YRK' || (p.secondaryAsset || '').toUpperCase() === 'YRK')
    if (yrkPool) return yrkPool
  }

  // 4. Fallback exact asset match where secondaryAsset matches or is undefined
  const basicMatch = allKnownPools.find((p) => (p.asset || '').toUpperCase() === posAssetClean && !p.secondaryAsset)
  if (basicMatch) return basicMatch

  return fallbackPool
}

export function DefiOperations({
  balances,
  onDetailRouteChange,
  onPositionAdded,
  onRetakeQuiz,
  onWithdrawn,
  positions,
  riskProfile,
  routeDetailTab,
  routePoolId,
  usdcBalance,
  xlmBalance,
}: {
  balances?: WalletBalance[]
  onDetailRouteChange: (poolId: string | null, detailTab: 'overview' | 'position') => void
  onPositionAdded: (pos: Omit<LocalPosition, 'id'>) => void
  onRetakeQuiz: () => void
  onWithdrawn: (id: string, amount: number) => void
  positions: LocalPosition[]
  riskProfile: RiskProfile | null
  routeDetailTab: 'overview' | 'position'
  routePoolId: string | null
  usdcBalance: number
  xlmBalance: number
}) {
  void onRetakeQuiz
  const selectedPoolId = routePoolId
  const detailTab = routeDetailTab
  const [filterTab, setFilterTab] = useState<'all' | 'stables' | 'xlm'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showXlmGuide, setShowXlmGuide] = useState(true)

  const openPoolDetails = (poolId: string, tab: 'overview' | 'position') => {
    onDetailRouteChange(poolId, tab)
  }

  const closePoolDetails = () => {
    onDetailRouteChange(null, 'overview')
  }

  const { publicKey } = useWallet()
  const portfolioState = usePortfolioDashboard(publicKey)

  const displayPositions = useMemo(() => {
    if (!publicKey) return []
    const apiPosList = portfolioState.state.status === 'success' ? portfolioState.state.data.portfolio.positions : []
    const validApiList = apiPosList.filter((apiP) => {
      if (!apiP) return false
      const cat = String(apiP.category || apiP.type || '').toUpperCase()
      if (cat === 'TOKEN' || cat === 'WALLET' || cat === 'BALANCE' || apiP.isToken === true || apiP.isLp === false) {
        return false
      }
      const pId = String(apiP.poolId ?? apiP.pool_id ?? apiP.contractId ?? apiP.contract_id ?? apiP.poolAddress ?? apiP.pool_address ?? '')
      const shares = Number(apiP.shares ?? apiP.lpShares ?? apiP.lp_shares ?? 0)
      if (!pId && shares <= 0 && cat !== 'AMM LP' && cat !== 'POOL') {
        return false
      }
      return true
    })
    const mappedApi: LocalPosition[] = validApiList.map((apiP, idx) => {
      const pId = String(apiP.poolId ?? apiP.pool_id ?? apiP.contractId ?? apiP.contract_id ?? apiP.poolAddress ?? apiP.pool_address ?? apiP.pool ?? apiP.id ?? '')
      const assetStr = String(apiP.asset ?? apiP.tokenSymbol ?? apiP.tokenCode ?? apiP.tokens ?? apiP.assetCode ?? apiP.asset_code ?? apiP.symbol ?? apiP.pair ?? apiP.assetA ?? apiP.asset_a ?? 'XLM')
      const rawCurrentValueUsd = apiP.currentValueUsd ?? apiP.valueUsd
      const rawPnlUsd = apiP.pnlUsd
      return {
        id: `api_pos_${idx}_${pId || assetStr}`,
        poolId: pId,
        asset: assetStr,
        amount: Number(apiP.amount ?? apiP.sharesOwned ?? apiP.shares ?? apiP.balance ?? 0),
        apy: Number.isFinite(Number(apiP.apy ?? apiP.estimatedApy)) ? Number(apiP.apy ?? apiP.estimatedApy) : 0,
        openedAt: Number.isFinite(Number(apiP.timestamp ?? apiP.openedAt)) ? Number(apiP.timestamp ?? apiP.openedAt) : 0,
        hash: String(apiP.hash ?? apiP.txHash ?? ''),
        protocol: String(apiP.protocol ?? 'Soroswap AMM'),
        status: String(apiP.status ?? 'SUCCESS'),
        timestamp: String(apiP.date ?? ''),
        category: (apiP.category as LocalPosition['category']) || 'AMM LP',
        currentValueUsd: rawCurrentValueUsd != null && Number.isFinite(Number(rawCurrentValueUsd))
          ? Number(rawCurrentValueUsd)
          : undefined,
        pnlUsd: rawPnlUsd != null && Number.isFinite(Number(rawPnlUsd)) ? Number(rawPnlUsd) : undefined,
        sharesOwned: Number(apiP.sharesOwned ?? apiP.shares ?? 0),
      }
    })
    const combined = [...positions]
    for (const p of mappedApi) {
      const existingIndex = combined.findIndex((candidate) => Boolean(candidate.poolId) && candidate.poolId === p.poolId)
      if (existingIndex >= 0) {
        combined[existingIndex] = {
          ...combined[existingIndex],
          currentValueUsd: p.currentValueUsd,
          pnlUsd: p.pnlUsd,
          sharesOwned: p.sharesOwned,
        }
      } else if (p.poolId) {
        combined.push(p)
      }
    }
    return combined
  }, [publicKey, positions, portfolioState.state])

  const poolsState = usePools(publicKey)
  const activePools = poolsState.status === 'success' ? poolsState.pools : []

  const filteredPools = activePools.filter((pool) => {
    const pairStr = `${pool.asset} ${pool.secondaryAsset ?? ''} ${pool.protocol}`.toLowerCase()
    if (searchQuery && !pairStr.includes(searchQuery.toLowerCase())) return false
    if (filterTab === 'xlm') return pool.asset === 'XLM' || pool.secondaryAsset === 'XLM'
    if (filterTab === 'stables') {
      const stables = ['USDC', 'EURC', 'USDT', 'DAI', 'USDW']
      return stables.includes(pool.asset) || (pool.secondaryAsset && stables.includes(pool.secondaryAsset))
    }
    return true
  })

  const positionPools: DeFiPool[] = displayPositions.map((pos) => ({
    id: pos.poolId,
    asset: pos.asset || 'XLM',
    name: `${pos.asset || 'XLM'} Vault`,
    protocol: 'Soroswap',
    apy: Number.isFinite(Number(pos.apy)) ? Number(pos.apy) : 0,
    apyAvailable: Number.isFinite(Number(pos.apy)),
    tvl: '--',
    tvlRaw: 0,
    depositsAvailable: false,
    risk: 'Conservative',
    riskDataAvailable: false,
    category: 'AMM LP',
    feeBp: 30,
    reputation: { liquidity: 0, age: 0, audit: 0, activity: 0 },
    method: 'addLiquidity()',
    rationale: 'Active user position liquidity pool.',
    contractId: pos.poolId || 'SoroswapPool',
  }))

  const allKnownPools = [
    ...activePools,
    ...(poolsState.status === 'success' ? poolsState.pools : []),
    ...positionPools,
  ]
  const selectedPool = allKnownPools.find((p) => p.id === selectedPoolId) ?? null
  const xlmFeaturedPool = activePools.find((pool) =>
    pool.asset?.toUpperCase() === 'XLM' || pool.secondaryAsset?.toUpperCase() === 'XLM',
  )
  const featuredPools = xlmFeaturedPool
    ? [xlmFeaturedPool, ...activePools.filter((pool) => pool.id !== xlmFeaturedPool.id).slice(0, 2)]
    : activePools.slice(0, 3)
  const hasOpenPosition = displayPositions.length > 0
  const portfolioCheckComplete = !publicKey || portfolioState.state.status === 'success' || portfolioState.state.status === 'error'
  const shouldShowXlmGuide = showXlmGuide && !hasOpenPosition && !hasCompletedXlmTestnetGuide() && portfolioCheckComplete

  useEffect(() => {
    if (!hasOpenPosition) return

    try {
      localStorage.setItem(XLM_TESTNET_GUIDE_COMPLETED_KEY, '1')
    } catch {
      /* The guide still remains hidden for the current page session. */
    }
  }, [hasOpenPosition])

  const getAvailableBalance = (assetCode?: string) => {
    if (!assetCode || typeof assetCode !== 'string') return 0
    if (!balances || balances.length === 0) {
      return assetCode === 'XLM' ? xlmBalance : usdcBalance
    }
    const matching = balances.filter((b) => b.code && typeof b.code === 'string' && b.code.toUpperCase() === assetCode.toUpperCase())
    if (matching.length === 0) return 0
    return matching.reduce((max, b) => Math.max(max, Number(b.balance) || 0), 0)
  }

  if (selectedPool) {
    return (
      <SafeErrorBoundary
        onReset={closePoolDetails}
      >
        <PoolDetailsView
          available={getAvailableBalance(selectedPool.asset)}
          initialTab={detailTab}
          onBack={closePoolDetails}
          onTabChange={(tab) => openPoolDetails(selectedPool.id, tab)}
          onPositionAdded={(pos) => {
            onPositionAdded(pos)
          }}
          onPositionRemoved={(id, amount) => {
            onWithdrawn(id, amount)
          }}
          pool={selectedPool}
          userPositions={displayPositions.filter((p) => Boolean(p.poolId) && (p.poolId === selectedPool.id || (selectedPool.contractId && p.poolId === selectedPool.contractId)))}
        />
      </SafeErrorBoundary>
    )
  }

  return (
    <div className="space-y-10">
      {/* Kamino-Style Positions Section (My Overview) */}
          {displayPositions.length > 0 && (
            <div className="space-y-6">
              {/* Header Title */}
              <div>
                <h2 className="text-lg font-medium text-white">My positions</h2>
                <p className="mt-1 text-sm text-[#9CA3AF]">
                  Track supplied liquidity and accrued yield.
                </p>
              </div>

              {(() => {
                const hasCompleteValues = displayPositions.every((position) => Number.isFinite(position.currentValueUsd))
                const totalValUsd = hasCompleteValues
                  ? displayPositions.reduce((acc, position) => acc + Number(position.currentValueUsd), 0)
                  : null
                const weightedApy = totalValUsd !== null && totalValUsd > 0
                  ? displayPositions.reduce((acc, p) => {
                      return acc + (Number(p.currentValueUsd) * p.apy)
                    }, 0) / Number(totalValUsd)
                  : displayPositions.reduce((acc, p) => acc + p.apy, 0) / (displayPositions.length || 1)
                const hasCompletePnl = displayPositions.every((position) => Number.isFinite(position.pnlUsd))
                const totalEarnedUsd = hasCompletePnl
                  ? displayPositions.reduce((acc, position) => acc + Number(position.pnlUsd), 0)
                  : null
                const displayCount = displayPositions.length
                const displayApy = Number.isFinite(weightedApy) ? weightedApy : 0

                return (
                  <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/[0.07] bg-[#0F141C] lg:grid-cols-4">
                    <div className="p-4 sm:px-5">
                      <p className="text-xs text-[#718096]">Positions</p>
                      <p className="font-terminal mt-1.5 text-lg font-medium tabular-nums text-white">{displayCount}</p>
                    </div>
                    <div className="border-l border-white/[0.07] p-4 sm:px-5">
                      <p className="text-xs text-[#718096]">Supplied</p>
                      <p className="font-terminal mt-1.5 text-lg font-medium tabular-nums text-white">{totalValUsd === null ? '--' : `$${formatUsd(totalValUsd)}`}</p>
                    </div>
                    <div className="border-t border-white/[0.07] p-4 sm:px-5 lg:border-l lg:border-t-0">
                      <p className="text-xs text-[#718096]">Avg APY</p>
                      <p className="font-terminal mt-1.5 text-lg font-medium tabular-nums text-[#35D49A]">{formatAmount(displayApy, 1)}%</p>
                    </div>
                    <div className="border-l border-t border-white/[0.07] p-4 sm:px-5 lg:border-t-0">
                      <p className="text-xs text-[#718096]">Earned</p>
                      <p className="font-terminal mt-1.5 text-lg font-medium tabular-nums text-[#35D49A]">{totalEarnedUsd === null ? '--' : formatEarnedUsd(totalEarnedUsd)}</p>
                    </div>
                  </div>
                )
              })()}

              <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#0F141C]">
                <div className="hidden grid-cols-[minmax(220px,2fr)_minmax(180px,1.2fr)_110px_minmax(170px,1.2fr)_100px] items-center gap-6 border-b border-white/[0.07] px-6 py-3.5 text-xs font-medium text-[#718096] lg:grid">
                  <span>Position</span>
                  <span>Supplied</span>
                  <span>APY</span>
                  <span>Earned</span>
                  <span />
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {displayPositions.map((pos) => {
                    const matchingPool = findMatchingPool(
                      pos,
                      allKnownPools,
                      positionPools.find((pool) => pool.id === pos.poolId) ?? positionPools[0],
                    )
                    const posValUsd = Number.isFinite(pos.currentValueUsd) ? Number(pos.currentValueUsd) : null
                    const earnedUsd = Number.isFinite(pos.pnlUsd) ? Number(pos.pnlUsd) : null
                    const posPair = matchingPool.secondaryAsset
                      ? `${matchingPool.asset} / ${matchingPool.secondaryAsset}`
                      : pos.asset === 'XLM' ? 'XLM / USDC' : `${pos.asset} / XLM`
                    const openPosition = () => {
                      openPoolDetails(matchingPool.id, 'position')
                    }

                    return (
                      <div key={pos.id}>
                        <button className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-4 text-left transition hover:bg-white/[0.02] lg:hidden" onClick={openPosition} type="button">
                          <span className="flex min-w-0 items-center gap-3">
                            <TokenAvatar code={pos.asset} size="md" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-white">{posPair}</span>
                              <span className="mt-0.5 block truncate text-xs text-[#718096]">{matchingPool.protocol}</span>
                            </span>
                          </span>
                          <span className="flex items-center gap-2 text-sm font-medium text-[#35D49A]">
                            {formatAmount(pos.apy, 1)}% <ChevronRight size={16} className="text-[#718096]" />
                          </span>
                          <span className="col-start-1 text-xs text-[#98A6B7]">{formatTokenAmount(pos.amount)} {pos.asset} · {posValUsd === null ? '--' : `$${formatUsd(posValUsd)}`}</span>
                          <span className="col-start-2 text-right text-xs text-[#35D49A]">{earnedUsd === null ? '--' : formatEarnedUsd(earnedUsd)}</span>
                        </button>

                        <div className="hidden grid-cols-[minmax(220px,2fr)_minmax(180px,1.2fr)_110px_minmax(170px,1.2fr)_100px] items-center gap-6 px-6 py-4 transition hover:bg-white/[0.02] lg:grid">
                          <div className="flex min-w-0 items-center gap-3">
                            <TokenAvatar code={pos.asset} size="md" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white">{posPair}</p>
                              <p className="mt-0.5 truncate text-xs text-[#718096]">{matchingPool.protocol}</p>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">{formatTokenAmount(pos.amount)} {pos.asset}</p>
                            <p className="mt-0.5 text-xs text-[#718096]">{posValUsd === null ? '--' : `$${formatUsd(posValUsd)}`}</p>
                          </div>
                          <span className="text-sm font-medium text-[#35D49A]">{formatAmount(pos.apy, 1)}%</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#35D49A]">{earnedUsd === null ? '--' : formatEarnedUsd(earnedUsd)}</p>
                          </div>
                          <button className="h-9 rounded-md bg-[#1A2230] px-4 text-sm font-medium text-white transition hover:bg-[#222C3B]" onClick={openPosition} type="button">Manage</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Kamino-Style Featured Strip */}
          <div>
            <SectionLabel>Featured pools</SectionLabel>

            {shouldShowXlmGuide && xlmFeaturedPool && (
              <div className="animate-fade-slide-up relative mt-4 flex flex-col gap-4 overflow-hidden rounded-lg border border-[#3B82F6]/30 bg-[#101722] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between" role="status">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#3B82F6]/12 text-[#70A5FF]">
                    <Info aria-hidden="true" size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Testnet quick start</p>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-[#98A6B7]">
                      Open the highlighted XLM pool and choose <span className="font-medium text-[#D7DEE8]">Single asset</span> to test deposits and withdrawals using the Testnet XLM already in your wallet.
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-[#718096]">
                      Testnet note: Pools without active liquidity may correctly display 0% APY.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
                  <button
                    className="h-8 rounded-md bg-[#3B82F6] px-3 text-xs font-semibold text-white transition hover:bg-[#4B8CF7]"
                    onClick={() => {
                      setShowXlmGuide(false)
                      openPoolDetails(xlmFeaturedPool.id, 'overview')
                    }}
                    type="button"
                  >
                    Try XLM pool
                  </button>
                  <button
                    aria-label="Dismiss Testnet quick start"
                    className="flex size-8 items-center justify-center rounded-md text-[#7D899A] transition hover:bg-white/[0.06] hover:text-white"
                    onClick={() => setShowXlmGuide(false)}
                    type="button"
                  >
                    <X aria-hidden="true" size={16} />
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {featuredPools.map((pool) => {
                const pairLabel = pool.secondaryAsset ? `${pool.asset} / ${pool.secondaryAsset}` : pool.asset
                const isGuidedXlmPool = shouldShowXlmGuide && pool.id === xlmFeaturedPool?.id
                return (
                  <div
                    key={`featured-${pool.id}`}
                    onClick={() => {
                      openPoolDetails(pool.id, 'overview')
                    }}
                    className={`group relative cursor-pointer overflow-hidden rounded-xl border p-5 transition-all duration-200 ${
                      selectedPoolId === pool.id
                        ? 'border-[#F2C12E]/55 bg-[#171A1D]'
                        : isGuidedXlmPool
                          ? 'border-[#3B82F6]/55 bg-[#111D2B] ring-1 ring-[#3B82F6]/20'
                        : 'border-white/[0.07] bg-[#101923] hover:border-white/[0.16] hover:bg-[#131E29]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex shrink-0">
                          <TokenAvatar code={pool.asset} />
                          {pool.secondaryAsset && (
                            <div className="-ml-2.5">
                              <TokenAvatar code={pool.secondaryAsset} />
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-[#F0F0F0]">{pairLabel}</span>
                        {isGuidedXlmPool && (
                          <span className="shrink-0 rounded-full border border-[#3B82F6]/30 bg-[#0E1B2C] px-2 py-0.5 text-[10px] font-semibold text-[#70A5FF]">
                            Start here
                          </span>
                        )}
                      </div>
                      <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-[#98A6B7]">
                        {pool.tvl} TVL
                      </span>
                    </div>

                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="text-3xl font-medium leading-8 text-[#F2C12E]">{pool.apyAvailable ? `${pool.apy.toFixed(2)}%` : '--'} <span className="text-xs font-medium text-[#F2C12E]">APY</span></p>
                        <p className="mt-0.5 text-xs text-[#9CA3AF]">{pool.protocol}</p>
                      </div>
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[#98A6B7] transition group-hover:bg-[#F2C12E]/10 group-hover:text-[#F2C12E]">
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Kamino-Style Filter & Search Bar */}
          <div className="space-y-4">
            <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { key: 'all' as const, label: 'All Vaults' },
                  { key: 'stables' as const, label: 'Stables' },
                  { key: 'xlm' as const, label: 'XLM' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilterTab(tab.key)}
                    type="button"
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-all ${
                      filterTab === tab.key
                        ? 'border border-[#F2C12E]/55 bg-[#F2C12E]/10 text-white'
                        : 'bg-[#141A24] text-[#98A6B7] hover:bg-[#19212D] hover:text-white'
                    }`}
                  >
                    {tab.key === 'stables' && <span className="font-bold">$</span>}
                    {tab.key === 'xlm' && <img src={xlmLogo} alt="XLM" className="size-3.5 rounded-full" />}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-[#718096] sm:inline">
                  Showing {filteredPools.length} of {activePools.length} vaults
                </span>
                <div className="relative w-full sm:w-auto">
                  <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#718096]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Assets or Pools..."
                    className="h-9 w-full rounded-full border border-white/[0.07] bg-[#141A24] pl-9 pr-4 text-sm text-white placeholder-[#718096] outline-none transition focus:border-[#F2C12E]/45 sm:w-64"
                  />
                </div>
              </div>
            </div>

            {/* Kamino-Style Pools Table */}
            <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.07] bg-[#0C1118]">
              {/* Table Header */}
              <div className="hidden grid-cols-[minmax(0,2.8fr)_110px_130px_150px_140px_110px] items-center gap-6 border-b border-white/[0.07] px-6 py-3.5 text-xs font-medium text-[#718096] lg:grid">
                <span>Vault</span>
                <span>APY</span>
                <span>Deposits</span>
                <span>Vault Profile</span>
                <span>Health Score</span>
                <span>Action</span>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-white/[0.04]">
                {filteredPools.map((pool) => {
                  const score = Number.isFinite(Number(pool.compositeScore)) ? Math.round(Number(pool.compositeScore)) : null
                  const label = score === null ? null : healthScoreLabel(score)
                  const pairLabel = pool.secondaryAsset ? `${pool.asset} / ${pool.secondaryAsset}` : pool.asset
                  const isSelected = selectedPoolId === pool.id
                  const isRecommended = pool.riskDataAvailable && riskProfile ? pool.risk === riskProfile : false

                  return (
                    <div key={pool.id}>
                      <button
                        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-4 text-left transition-colors lg:hidden ${
                          isSelected ? 'bg-[#F2C12E]/[0.06]' : 'hover:bg-white/[0.025]'
                        }`}
                        onClick={() => {
                          openPoolDetails(pool.id, 'overview')
                        }}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex shrink-0">
                            <TokenAvatar code={pool.asset} />
                            {pool.secondaryAsset && <span className="-ml-2.5"><TokenAvatar code={pool.secondaryAsset} /></span>}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">{pairLabel}</span>
                            <span className="mt-0.5 block truncate text-xs text-[#718096]">{pool.protocol}</span>
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#35D49A]">{pool.apyAvailable ? `${pool.apy.toFixed(2)}%` : '--'}</span>
                          <ChevronRight size={16} className="text-[#718096]" />
                        </span>
                        <span className="col-start-1 text-xs text-[#718096]">Deposits</span>
                        <span className="col-start-2 text-right text-xs font-medium text-[#D7DEE8]">{pool.tvl}</span>
                      </button>
                      <div
                        onClick={() => {
                          openPoolDetails(pool.id, 'overview')
                        }}
                        className={`hidden cursor-pointer grid-cols-[minmax(0,2.8fr)_110px_130px_150px_140px_110px] items-center gap-6 px-6 py-4 transition-colors lg:grid ${
                          isSelected ? 'bg-[#F2C12E]/[0.06]' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        {/* Vault column */}
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex shrink-0">
                            <TokenAvatar code={pool.asset} />
                            {pool.secondaryAsset && (
                              <div className="-ml-2.5">
                                <TokenAvatar code={pool.secondaryAsset} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-[#F0F0F0]">{pairLabel}</span>
                              {isRecommended && (
                                <span className="shrink-0 rounded-full bg-[#16A34A]/20 px-2 py-0.5 text-[10px] font-bold text-[#16A34A]">
                                  ★ Recommended
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-[#9CA3AF]">{pool.protocol}</p>
                          </div>
                        </div>

                        {/* APY */}
                        <span className="text-sm font-medium text-[#35D49A]">
                          {pool.apyAvailable ? `${pool.apy.toFixed(2)}%` : '--'}
                        </span>

                        {/* Deposits */}
                        <span className="text-sm font-medium text-[#D7DEE8]">{pool.tvl}</span>

                        {/* Vault Profile (Risk badge) */}
                        <div className="flex items-center">
                          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.035] px-2.5 text-xs font-medium leading-none text-[#D7DEE8]">
                            <span
                              className={`size-1.5 rounded-full ${
                                !pool.riskDataAvailable
                                  ? 'bg-[#657284]'
                                  : pool.risk === 'Conservative'
                                  ? 'bg-[#16A34A]'
                                  : pool.risk === 'Moderate'
                                    ? 'bg-[#F2C12E]'
                                    : 'bg-[#DC2626]'
                              }`}
                            />
                            {!pool.riskDataAvailable ? 'Unavailable' : pool.risk === 'Moderate' ? 'Balanced' : pool.risk}
                          </span>
                        </div>

                        {/* Health Score */}
                        <div className="flex items-center">
                          <span
                            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium leading-none ${
                              label === null
                                ? 'border-white/[0.08] bg-white/[0.035] text-[#7D899A]'
                                : label === 'Trusted'
                                ? 'border-[#35D49A]/20 bg-[#35D49A]/[0.07] text-[#35D49A]'
                                : label === 'Moderate'
                                  ? 'border-[#F2C12E]/20 bg-[#F2C12E]/[0.07] text-[#F2C12E]'
                                  : 'border-red-400/20 bg-red-400/[0.07] text-red-400'
                            }`}
                          >
                            {score === null ? (
                              <span>Unavailable</span>
                            ) : (
                              <>
                                <span className="tabular-nums">{score}</span>
                                <span className="opacity-50">&middot;</span>
                                <span>{label}</span>
                              </>
                            )}
                          </span>
                        </div>

                        {/* Action */}
                        <div className="flex items-center justify-start">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openPoolDetails(pool.id, 'overview')
                            }}
                            className={`h-9 w-[88px] rounded-md px-3 text-sm font-medium transition-all ${
                              isSelected
                                ? 'bg-[#F2C12E] text-[#0D0D12]'
                                : 'bg-[#1A2230] text-[#F0F0F0] hover:bg-[#222C3B]'
                            }`}
                          >
                            {isSelected ? 'Selected ✓' : 'Deposit'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {poolsState.status === 'loading' && (
                  <div className="px-6 py-10 text-center text-sm text-[#7D899A]">Loading live pool metrics...</div>
                )}
                {poolsState.status === 'error' && (
                  <div className="px-6 py-10 text-center text-sm text-[#7D899A]">Live pool metrics are currently unavailable.</div>
                )}
                {poolsState.status === 'success' && filteredPools.length === 0 && (
                  <div className="px-6 py-10 text-center text-sm text-[#7D899A]">No pools match the selected filters.</div>
                )}
              </div>
            </div>
          </div>
    </div>
  )
}

// ─── Position Card ────────────────────────────────────────────────────────────

export function PositionCard({
  onManage,
  position,
}: {
  onManage: () => void
  position: LocalPosition
}) {
  const elapsed = getNowTimestamp() - position.openedAt
  const hours = elapsed / 3_600_000
  const earned = position.amount * (position.apy / 100) * (hours / 8760)
  const isDemo = position.id.startsWith('demo-')

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#12121A] transition-all duration-200 hover:border-[#16A34A]/40 hover:shadow-sm">
      {/* Left accent strip */}
      <div className="absolute inset-y-0 left-0 w-[3px] bg-[#16A34A]" />

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] py-3 pl-7 pr-5">
        <span className="rounded-md bg-[#181824] px-2.5 py-0.5 text-xs font-semibold text-[#F0F0F0]">
          {position.protocol}
        </span>
        <span className="rounded-md border border-white/[0.08] px-2.5 py-0.5 text-xs text-[#9CA3AF]">
          {position.category}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#16A34A] opacity-50" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[#16A34A]" />
          </span>
          <span className="text-xs font-semibold text-[#16A34A]">Active</span>
        </div>
      </div>

      <div className="py-5 pl-7 pr-5">
        {/* Main figures */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-[#9CA3AF]">Staked</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums leading-none text-[#F0F0F0]">
              {formatAmount(position.amount, 2)}
              <span className="ml-1.5 text-base font-normal text-[#9CA3AF]">{position.asset}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.15em] text-[#9CA3AF]">Est. earned</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums leading-none text-[#16A34A]">
              +{formatAmount(earned, earned < 0.01 ? 4 : 2)}
              <span className="ml-1 text-sm font-normal text-[#16A34A]/70">{position.asset}</span>
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF]">APY</p>
            <p className="mt-1 text-sm font-semibold text-[#F2C12E]">{(Number(position.apy) || 0).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF]">Duration</p>
            <p className="mt-1 text-sm font-semibold text-[#F0F0F0]">{formatElapsed(elapsed)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF]">Opened</p>
            <p className="mt-1 text-sm font-semibold text-[#F0F0F0]">{position.timestamp}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between gap-4">
          {isDemo ? (
            <span className="text-xs text-[#9CA3AF]/60">Demo position</span>
          ) : (
            <a
              className="font-terminal text-xs text-[#9CA3AF] underline underline-offset-4 transition hover:text-[#F0F0F0]"
              href={`https://stellar.expert/explorer/testnet/tx/${position.hash}`}
              rel="noreferrer"
              target="_blank"
            >
              {position.hash.slice(0, 14)}…
            </a>
          )}
          <button
            className="rounded-xl bg-[#F2C12E] px-5 py-2.5 text-sm font-semibold text-[#0D0D12] transition-all duration-150 hover:bg-[#F2C12E]/90"
            onClick={onManage}
            type="button"
          >
            Manage →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Position Manage Modal ────────────────────────────────────────────────────

export function PositionManageModal({
  onClose,
  onWithdrawn,
  position,
}: {
  onClose: () => void
  onWithdrawn: (id: string, amount: number) => void
  position: LocalPosition
}) {
  const { networkPassphrase, networkUrl, publicKey, status } = useWallet()
  const [withdrawAmount, setWithdrawAmount] = useState(position.amount)
  const [txState, setTxState] = useState<'idle' | 'signing' | 'submitted' | 'error'>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txMessage, setTxMessage] = useState<string | null>(null)

  const elapsed = getNowTimestamp() - position.openedAt
  const hours = elapsed / 3_600_000
  const earned = position.amount * (position.apy / 100) * (hours / 8760)
  const isPartial = withdrawAmount < position.amount && withdrawAmount > 0

  const isTestnet = networkPassphrase?.toLowerCase().includes('test') ?? false
  const canSign =
    status === 'CONNECTED' && Boolean(publicKey) && Boolean(networkUrl) && Boolean(networkPassphrase) && isTestnet

  const handleWithdraw = async () => {
    setTxMessage(null)
    setTxHash(null)

    if (!publicKey || !networkUrl || !networkPassphrase) {
      setTxState('error')
      setTxMessage('Connect your Freighter wallet first.')
      return
    }

    if (!isTestnet) {
      setTxState('error')
      setTxMessage('Switch Freighter to Testnet to continue.')
      return
    }

    try {
      setTxState('signing')
      const result = await executeApiPoolTransaction({
        publicKey,
        signTransactionFn: signTransaction,
        params: {
          poolId: position.poolId || position.id,
          action: 'WITHDRAW',
          shareAmount: withdrawAmount,
          slippageBps: 50,
          userAddress: publicKey,
        },
      })
      setTxState('submitted')
      setTxHash(result.hash)
    } catch (error) {
      const { message } = classifyWalletError(error)
      setTxState('error')
      setTxMessage(message)
    }
  }

  const handleConfirmClose = () => {
    if (txState === 'submitted') {
      onWithdrawn(position.id, withdrawAmount)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0D0D12]/80 backdrop-blur-sm sm:items-center sm:px-4">
      <button
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={handleConfirmClose}
        type="button"
      />

      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/[0.12] bg-[#14141E] shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[#9CA3AF]">Manage position</p>
            <h2 className="mt-0.5 text-lg font-semibold text-[#F0F0F0]">{position.protocol}</h2>
          </div>
          <button
            className="flex size-8 items-center justify-center rounded-full border border-white/[0.12] text-[#9CA3AF] transition hover:border-white/[0.25] hover:text-[#F0F0F0]"
            onClick={handleConfirmClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {/* Position stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatBox
              label="Staked"
              value={`${position.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${position.asset}`}
            />
            <StatBox label="APY" value={`${position.apy.toFixed(1)}%`} highlight />
            <StatBox
              label="Est. earned"
              value={`+${earned < 0.01 ? earned.toFixed(4) : earned.toFixed(2)} ${position.asset}`}
              positive
            />
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm">
            <span className="text-[#9CA3AF]">Opened {formatElapsed(elapsed)} ago</span>
            {position.id.startsWith('demo-') ? (
              <span className="rounded-md bg-white/[0.08] px-2 py-0.5 text-xs text-[#9CA3AF]">
                Demo position
              </span>
            ) : (
              <a
                className="font-terminal text-xs text-[#9CA3AF] underline underline-offset-4 hover:text-[#F0F0F0]"
                href={`https://stellar.expert/explorer/testnet/tx/${position.hash}`}
                rel="noreferrer"
                target="_blank"
              >
                {position.hash.slice(0, 10)}…
              </a>
            )}
          </div>

          {/* Withdraw section */}
          {txState !== 'submitted' && (
            <>
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[#F0F0F0]" htmlFor="withdraw-amount">
                    Withdraw amount
                  </label>
                  <span className="text-xs text-[#9CA3AF]">
                    {isPartial ? 'Partial' : 'Full'} withdrawal
                  </span>
                </div>
                <div className="relative mt-1.5">
                  <input
                    className="w-full rounded-xl border border-white/[0.12] bg-[#12121A] px-3 py-3 pr-20 text-[#F0F0F0] outline-none transition focus:border-[#F2C12E]"
                    id="withdraw-amount"
                    max={position.amount}
                    min={0}
                    onChange={(e) =>
                      setWithdrawAmount(Math.min(Number(e.target.value), position.amount))
                    }
                    step={position.asset === 'USDC' ? 0.01 : 1}
                    type="number"
                    value={withdrawAmount}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-3">
                    <span className="text-sm font-medium text-[#9CA3AF]">{position.asset}</span>
                    <button
                      className="rounded-md bg-[#F2C12E]/15 px-1.5 py-0.5 text-xs font-semibold text-[#F2C12E] transition hover:bg-[#F2C12E]/25"
                      onClick={() => setWithdrawAmount(position.amount)}
                      type="button"
                    >
                      Max
                    </button>
                  </div>
                </div>
                <input
                  aria-label="Withdraw amount slider"
                  className="mt-3 w-full accent-[#F2C12E]"
                  max={position.amount}
                  min={0}
                  onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                  step={position.asset === 'USDC' ? 0.01 : 1}
                  type="range"
                  value={withdrawAmount}
                />
                <div className="mt-1 flex justify-between text-xs text-[#9CA3AF]">
                  <span>0</span>
                  <span>
                    {position.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                    {position.asset}
                  </span>
                </div>
              </div>

              {!isTestnet && status === 'CONNECTED' && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F2C12E]/25 bg-[#F2C12E]/10 p-3 text-sm text-[#F0F0F0]">
                  <span className="mt-0.5 shrink-0 text-[#F2C12E]">⚠</span>
                  <p>
                    Switch Freighter to <strong>Testnet</strong> to continue.
                  </p>
                </div>
              )}

              {txMessage && txState === 'error' && (
                <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {txMessage}
                </p>
              )}

              <button
                className="mt-5 w-full rounded-xl bg-[#F2C12E] py-3.5 text-sm font-semibold text-[#0D0D12] transition duration-150 hover:bg-[#F2C12E]/90 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={withdrawAmount <= 0 || txState === 'signing' || !canSign}
                onClick={handleWithdraw}
                type="button"
              >
                {txState === 'signing'
                  ? 'Waiting for Freighter…'
                  : !canSign
                    ? status !== 'CONNECTED'
                      ? 'Connect wallet'
                      : 'Switch to Testnet'
                    : isPartial
                      ? `Sign partial withdrawal · ${withdrawAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${position.asset}`
                      : `Sign full withdrawal · ${position.amount} ${position.asset}`}
              </button>
              <p className="mt-2 text-center text-xs text-[#9CA3AF]">
                Transaction data is built by the Terminal8 API for Stellar Testnet.
              </p>
            </>
          )}

          {/* Success state */}
          {txState === 'submitted' && txHash && (
            <div className="mt-4 rounded-2xl border border-[#16A34A]/30 bg-[#16A34A]/10 p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#16A34A] text-sm font-bold text-[#0D0D12]">
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#F0F0F0]">Withdrawal confirmed</p>
                  <p className="mt-0.5 text-sm text-[#9CA3AF]">
                    {isPartial
                      ? `${withdrawAmount} ${position.asset} withdrawn · remaining position updated`
                      : `Full position closed · ${position.amount} ${position.asset} returned`}
                  </p>
                  <a
                    className="mt-3 block truncate rounded-lg border border-[#16A34A]/20 bg-white/[0.04] px-3 py-2 font-terminal text-xs text-[#F0F0F0] transition hover:border-[#16A34A]/50"
                    href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {txHash}
                  </a>
                </div>
              </div>
              <button
                className="mt-4 w-full rounded-xl bg-[#F2C12E] py-3 text-sm font-semibold text-[#0D0D12] transition duration-150 hover:bg-[#F2C12E]/90"
                onClick={handleConfirmClose}
                type="button"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Pool Card ────────────────────────────────────────────────────────────────

export function PoolCard({
  expanded,
  onSelect,
  onToggleReputation,
  pool,
  selected,
}: {
  expanded: boolean
  onSelect: () => void
  onToggleReputation: () => void
  pool: DeFiPool
  selected: boolean
}) {
  const score = Number.isFinite(Number(pool.compositeScore)) ? Math.round(Number(pool.compositeScore)) : null
  const label = score === null ? null : healthScoreLabel(score)
  const pairLabel = pool.secondaryAsset ? `${pool.asset} / ${pool.secondaryAsset}` : pool.asset

  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
        selected
          ? 'border-[#F2C12E] bg-[#141420] shadow-sm'
          : 'border-white/[0.08] bg-[#12121A] hover:border-white/[0.18]'
      }`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[#181824] px-2 py-0.5 text-xs font-semibold text-[#F0F0F0]">
                {pool.protocol}
              </span>
              <span className="rounded-md border border-white/[0.08] px-2 py-0.5 text-xs text-[#9CA3AF]">
                {pool.category}
              </span>
            </div>
            <p className="mt-2 text-base font-semibold text-[#F0F0F0]">{pairLabel}</p>
            <p className="mt-0.5 text-sm text-[#9CA3AF]">{pool.rationale}</p>
          </div>

          <button
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
              !label
                ? 'border-white/[0.08] bg-white/[0.04] text-[#7D899A]'
                : label === 'Trusted'
                ? 'border-[#16A34A]/30 bg-[#16A34A]/10 text-[#16A34A] hover:bg-[#16A34A]/20'
                : label === 'Moderate'
                  ? 'border-[#F2C12E]/30 bg-[#F2C12E]/10 text-[#F2C12E] hover:bg-[#F2C12E]/20'
                  : 'border-red-400/25 bg-red-400/8 text-red-400 hover:bg-red-400/15'
            }`}
            onClick={onToggleReputation}
            title="View trust score breakdown"
            type="button"
          >
            <span
              className={`mr-1.5 inline-block size-1.5 rounded-full align-middle ${
                !label
                  ? 'bg-[#718096]'
                  : label === 'Trusted'
                  ? 'bg-[#16A34A]'
                  : label === 'Moderate'
                    ? 'bg-[#F2C12E]'
                    : 'bg-red-400'
              }`}
            />
            {score === null ? 'Unavailable' : `${score} · ${label}`}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Metric label="APY" value={`${pool.apy.toFixed(1)}%`} highlight />
          <Metric label="TVL" value={pool.tvl} />
          {pool.utilization !== undefined ? (
            <Metric label="Utilization" value={`${pool.utilization}%`} />
          ) : (
            <Metric label="24h Vol" value={pool.volume24h ?? '—'} />
          )}
        </div>

        {pool.utilization !== undefined && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-[#F2C12E] transition-all duration-300"
                style={{ width: `${pool.utilization}%` }}
              />
            </div>
          </div>
        )}

        {expanded && <ReputationBreakdown poolId={pool.id} />}

        <div className="mt-4">
          <button
            className={`w-full rounded-xl border py-2.5 text-sm font-semibold transition-all duration-150 ${
              selected
                ? 'border-[#F2C12E] bg-[#F2C12E] text-[#0D0D12]'
                : 'border-white/[0.12] bg-white/[0.04] text-[#F0F0F0] hover:border-white/[0.25] hover:bg-white/[0.08]'
            }`}
            onClick={onSelect}
            type="button"
          >
            {selected ? 'Selected ✓' : 'Select pool →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reputation Breakdown ─────────────────────────────────────────────────────

function ReputationBreakdown({ poolId }: { poolId: string }) {
  const riskState = usePoolRisk(poolId)
  const liveRisk = riskState.status === 'success' ? riskState.data : null

  if (!liveRisk) {
    return (
      <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#161622] p-4 text-xs text-[#9CA3AF]">
        {riskState.status === 'loading' || riskState.status === 'idle'
          ? 'Loading live risk data...'
          : 'Live risk data is currently unavailable.'}
      </div>
    )
  }

  const rows = [
    { label: 'Audit Security', value: liveRisk.trustScore },
    { label: 'Liquidity Depth', value: liveRisk.tvlScore },
    { label: 'Volatility Stability', value: liveRisk.volatilityScore },
    { label: 'APY Health', value: liveRisk.apyScore },
  ]

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-white/[0.08] bg-[#161622] p-4">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">Trust & Risk Score</p>
            {liveRisk && (
              <span className="rounded bg-[#F2C12E]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#F2C12E]">
                LIVE API · {liveRisk.riskLevel}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-[#F0F0F0]">{liveRisk.compositeScore}/100</p>
        </div>
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[#9CA3AF]">{row.label}</span>
                <span className="font-medium text-[#F0F0F0]">
                  {row.value}/100
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-[#16A34A] transition-all duration-300"
                  style={{ width: `${row.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Stake Ticket ─────────────────────────────────────────────────────────────

export function StakeTicket({
  available,
  onPositionAdded,
  pool,
}: {
  available: number
  onPositionAdded: (pos: Omit<LocalPosition, 'id'>) => void
  pool: DeFiPool
}) {
  const { networkPassphrase, networkUrl, publicKey, status } = useWallet()
  const [amount, setAmount] = useState(0)
  const [txState, setTxState] = useState<'idle' | 'signing' | 'submitted' | 'error'>('idle')
  const [txMessage, setTxMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const isLP = pool.category === 'AMM LP' || pool.category === 'AMM Rewards'
  const secondaryAsset = pool.secondaryAsset as 'XLM' | 'USDC' | undefined
  const secondaryAmount = isLP && secondaryAsset && (secondaryAsset === 'XLM' || secondaryAsset === 'USDC')
    ? estimateSecondaryAmount(pool.asset, amount)
    : 0

  const isTestnet = networkPassphrase?.toLowerCase().includes('test') ?? false
  const isConnected =
    status === 'CONNECTED' && Boolean(publicKey) && Boolean(networkUrl) && Boolean(networkPassphrase)
  const canSign = isConnected && isTestnet

  const handleExecute = async () => {
    setTxMessage(null)
    setTxHash(null)

    if (!isConnected || !publicKey || !networkUrl || !networkPassphrase) {
      setTxState('error')
      setTxMessage('Connect your Freighter wallet first.')
      return
    }

    if (!isTestnet) {
      setTxState('error')
      setTxMessage('Switch Freighter to Testnet to continue.')
      return
    }

    try {
      setTxState('signing')

      const result = await executeApiPoolTransaction({
        publicKey,
        signTransactionFn: signTransaction,
        params: {
          poolId: pool.id,
          action: 'DEPOSIT',
          amountA: amount,
          amountB: secondaryAmount || 0,
          shareAmount: amount,
          slippageBps: 50,
          userAddress: publicKey,
        },
      })

      setTxState('submitted')
      setTxHash(result.hash)
      onPositionAdded({
        amount,
        asset: pool.asset,
        hash: result.hash,
        protocol: pool.protocol,
        status: result.status,
        timestamp: new Date().toLocaleTimeString(),
        openedAt: getNowTimestamp(),
        apy: pool.apy,
        category: pool.category,
        poolId: pool.id,
      })
    } catch (error) {
      const { message } = classifyWalletError(error)
      setTxState('error')
      setTxMessage(message)
    }
  }

  const buttonLabel = () => {
    if (txState === 'signing') return 'Waiting for wallet…'
    if (!isConnected) return 'Connect wallet'
    if (!isTestnet) return 'Switch to Testnet'
    if (isLP) return `Add liquidity · ${amount} ${pool.asset}`
    return `Sign & supply · ${amount} ${pool.asset}`
  }

  return (
    <div className="sticky top-4 rounded-2xl border border-white/[0.12] bg-[#14141E] p-6 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#9CA3AF]">
            {pool.category === 'Lending' ? 'Supply' : 'Add Liquidity'}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[#F0F0F0]">{pool.protocol}</h2>
        </div>
        <span className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-[#9CA3AF]">
          Testnet
        </span>
      </div>

      <div className="mt-4 rounded-xl bg-[#12121A] border border-white/[0.08] p-4 text-[#F0F0F0]">
        <p className="text-xs text-[#9CA3AF]">Available {pool.asset}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {available.toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </p>
        <p className="mt-1 text-xs text-[#9CA3AF]/70">{pool.asset} · Freighter balance</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <TicketStat label="Target APY" value={`${pool.apy.toFixed(1)}%`} />
        <TicketStat label="Method" value={pool.method} mono />
      </div>

      <label className="mt-5 block text-sm font-medium text-[#F0F0F0]" htmlFor="stake-amount">
        Amount to supply
      </label>
      <div className="relative mt-1.5">
        <input
          className="w-full rounded-xl border border-white/[0.12] bg-[#12121A] px-3 py-3 pr-20 text-[#F0F0F0] outline-none transition focus:border-[#F2C12E]"
          id="stake-amount"
          max={available}
          min={0}
          onChange={(e) => setAmount(Math.min(Number(e.target.value), available))}
          type="number"
          value={amount}
        />
        <div className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-3">
          <span className="text-sm font-medium text-[#9CA3AF]">{pool.asset}</span>
          <button
            className="rounded-md bg-[#F2C12E]/15 px-1.5 py-0.5 text-xs font-semibold text-[#F2C12E] transition hover:bg-[#F2C12E]/25"
            onClick={() => setAmount(available)}
            type="button"
          >
            Max
          </button>
        </div>
      </div>
      <input
        aria-label="Stake amount slider"
        className="mt-3 w-full accent-[#F2C12E]"
        max={available}
        min={0}
        onChange={(e) => setAmount(Number(e.target.value))}
        step={pool.asset === 'USDC' ? 0.01 : 1}
        type="range"
        value={amount}
      />

      {isLP && secondaryAsset && amount > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF]">Paired amount</p>
            <p className="mt-0.5 text-sm font-semibold text-[#F0F0F0]">
              {secondaryAmount.toFixed(4)}{' '}
              <span className="font-normal text-[#9CA3AF]">{secondaryAsset}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF]">Est. ratio</p>
            <p className="mt-0.5 font-terminal text-xs text-[#9CA3AF]">
              1 {pool.asset} ≈ {(secondaryAmount / amount).toFixed(4)} {secondaryAsset}
            </p>
          </div>
        </div>
      )}

      {!isTestnet && isConnected && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F2C12E]/25 bg-[#F2C12E]/10 p-3 text-sm text-[#F0F0F0]">
          <span className="mt-0.5 shrink-0 text-[#F2C12E]">⚠</span>
          <p>
            Switch Freighter to <strong>Testnet</strong> to continue.
          </p>
        </div>
      )}

      <button
        className="mt-5 w-full rounded-xl bg-[#F2C12E] py-3.5 text-sm font-semibold text-[#0D0D12] transition duration-150 hover:bg-[#F2C12E]/90 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={amount <= 0 || available <= 0 || txState === 'signing' || !canSign}
        onClick={handleExecute}
        type="button"
      >
        {buttonLabel()}
      </button>

      <p className="mt-2.5 text-center text-xs text-[#9CA3AF]">
        Transaction data is built by the Terminal8 API for Stellar Testnet.
      </p>

      {txMessage && txState === 'error' && (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {txMessage}
        </p>
      )}

      {txState === 'submitted' && txHash && (
        <div className="mt-4 rounded-xl border border-[#16A34A]/30 bg-[#16A34A]/10 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#16A34A] text-xs font-bold text-[#0D0D12]">
              ✓
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-[#F0F0F0]">Supply confirmed</p>
              <p className="mt-0.5 text-xs text-[#9CA3AF]">Position added to your open positions</p>
              <a
                className="mt-2 block truncate rounded-lg border border-[#16A34A]/20 bg-white/[0.04] px-3 py-2 font-terminal text-xs text-[#F0F0F0] transition hover:border-[#16A34A]/50"
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                rel="noreferrer"
                target="_blank"
              >
                {txHash}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


function formatElapsed(ms: number) {
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-lg font-medium text-white">{children}</h2>
  )
}

export function PortfolioWidget({
  onRetakeQuiz,
  riskProfile,
  usdcBalance,
  xlmBalance,
}: {
  onRetakeQuiz: () => void
  riskProfile: RiskProfile | null
  usdcBalance: number
  xlmBalance: number
}) {
  const riskDot =
    riskProfile === 'Conservative'
      ? 'bg-[#16A34A]'
      : riskProfile === 'Moderate'
        ? 'bg-[#F2C12E]'
        : 'bg-[#F97316]'

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#12121A] px-5 py-4">
      <div className="flex flex-wrap items-center gap-6">
        <div className="border-r border-white/[0.08] pr-6">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#9CA3AF]">Portfolio</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#F0F0F0]">Testnet</p>
          <p className="mt-0.5 text-[10px] text-[#9CA3AF]/60">Live wallet balances</p>
        </div>

        <div className="flex items-center gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF]">XLM</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-[#F0F0F0]">{xlmBalance.toFixed(2)}</p>
          </div>
          <div className="h-6 w-px bg-white/[0.08]" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF]">USDC</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-[#F0F0F0]">{usdcBalance.toFixed(2)}</p>
          </div>
        </div>

        {riskProfile && (
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2">
            <span className={`size-2 rounded-full ${riskDot}`} />
            <span className="text-sm font-medium text-[#F0F0F0]">{riskProfile}</span>
            <span className="text-white/[0.2]">·</span>
            <button
              className="text-xs text-[#9CA3AF] underline underline-offset-4 transition hover:text-[#F0F0F0]"
              onClick={onRetakeQuiz}
              type="button"
            >
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({
  highlight,
  label,
  value,
}: {
  highlight?: boolean
  label: string
  value: string
}) {
  return (
    <div>
      <p className="text-xs text-[#9CA3AF]">{label}</p>
      <p
        className={`mt-0.5 text-base font-semibold ${highlight ? 'text-[#16A34A]' : 'text-[#F0F0F0]'}`}
      >
        {value}
      </p>
    </div>
  )
}


function StatBox({
  highlight,
  label,
  positive,
  value,
}: {
  highlight?: boolean
  label: string
  positive?: boolean
  value: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
      <p className="text-xs text-[#9CA3AF]">{label}</p>
      <p
        className={`mt-1 text-sm font-semibold ${
          positive ? 'text-[#16A34A]' : highlight ? 'text-[#F2C12E]' : 'text-[#F0F0F0]'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function TicketStat({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
      <p className="text-xs text-[#9CA3AF]">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold text-[#F0F0F0] ${mono ? 'font-terminal' : ''}`}>
        {value}
      </p>
    </div>
  )
}

type BundleAlloc = {
  poolId: string
  label: string
  pct: number
  category: 'Lending' | 'AMM LP' | 'AMM Rewards'
  asset: 'XLM' | 'USDC'
}

type YieldBundle = {
  id: string
  name: string
  tagline: string
  risk: RiskProfile
  estApy: number
  dotColor: string
  borderActive: string
  bgActive: string
  textColor: string
  allocations: BundleAlloc[]
}

// ─── Bundle Card ──────────────────────────────────────────────────────────────

export function BundleCard({
  bundle,
  isRecommended,
  onExecute,
}: {
  bundle: YieldBundle
  isRecommended: boolean
  onExecute: () => void
}) {
  const barColors = ['bg-[#F2C12E]', 'bg-[#1E3A8A]', 'bg-[#16A34A]']

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
        isRecommended
          ? `${bundle.borderActive} ${bundle.bgActive} shadow-sm`
          : 'border-white/[0.08] bg-[#12121A] hover:border-white/[0.18]'
      }`}
    >
      {isRecommended && (
        <div className={`absolute right-0 top-0 rounded-bl-xl px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${bundle.bgActive} ${bundle.textColor} border-b border-l ${bundle.borderActive}`}>
          Recommended
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${bundle.dotColor}`} />
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9CA3AF]">
                {bundle.risk}
              </p>
            </div>
            <h3 className="mt-1.5 text-lg font-bold text-[#F0F0F0]">{bundle.name}</h3>
            <p className="text-sm text-[#9CA3AF]">{bundle.tagline}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF]">Est. APY</p>
            <p className={`mt-0.5 text-xl font-bold ${bundle.textColor}`}>
              {bundle.estApy.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          {bundle.allocations.map((alloc, i) => (
            <div key={alloc.poolId}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[#9CA3AF]">{alloc.label}</span>
                <span className="font-semibold text-[#F0F0F0]">{alloc.pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColors[i % barColors.length]}`}
                  style={{ width: `${alloc.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          className={`mt-5 w-full rounded-xl py-2.5 text-sm font-semibold transition-all duration-150 ${
            isRecommended
              ? 'bg-[#F2C12E] text-[#0D0D12] hover:bg-[#F2C12E]/90'
              : 'border border-white/[0.12] bg-white/[0.04] text-[#F0F0F0] hover:border-white/[0.2] hover:bg-white/[0.08]'
          }`}
          onClick={onExecute}
          type="button"
        >
          Execute bundle →
        </button>
      </div>
    </div>
  )
}

// ─── Bundle Execute Modal ─────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done' | 'error'

type ExecStep = {
  label: string
  status: StepStatus
  hash?: string
  error?: string
}

export function BundleExecuteModal({
  bundle,
  onClose,
  onPositionAdded,
  usdcBalance,
}: {
  bundle: YieldBundle
  onClose: () => void
  onPositionAdded: (pos: Omit<LocalPosition, 'id'>) => void
  usdcBalance: number
}) {
  const { networkPassphrase, networkUrl, publicKey, status } = useWallet()
  const [amount, setAmount] = useState(0)
  const [steps, setSteps] = useState<ExecStep[]>([])
  const [executing, setExecuting] = useState(false)
  const [done, setDone] = useState(false)

  const isConnected = status === 'CONNECTED' && Boolean(publicKey) && Boolean(networkUrl) && Boolean(networkPassphrase)
  const isTestnet = networkPassphrase?.toLowerCase().includes('test') ?? false
  const canExecute = isConnected && isTestnet && amount > 0

  const maxAmount = usdcBalance

  const preview = bundle.allocations.map((alloc) => ({
    ...alloc,
    amount: (amount * alloc.pct) / 100,
  }))

  const updateStep = (index: number, patch: Partial<ExecStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const handleExecute = async () => {
    if (!canExecute || !publicKey || !networkUrl || !networkPassphrase) return

    const initialSteps: ExecStep[] = bundle.allocations.map((alloc) => ({
      label: `${alloc.label} — ${((amount * alloc.pct) / 100).toFixed(2)} ${alloc.asset}`,
      status: 'pending',
    }))
    setSteps(initialSteps)
    setExecuting(true)

    for (let i = 0; i < bundle.allocations.length; i++) {
      const alloc = bundle.allocations[i]
      const allocAmount = (amount * alloc.pct) / 100

      updateStep(i, { status: 'running' })

      try {
        const result = await executeApiPoolTransaction({
          publicKey,
          signTransactionFn: signTransaction,
          params: {
            poolId: alloc.poolId || `pool_${i}`,
            action: 'DEPOSIT',
            amountA: allocAmount,
            amountB: 0,
            shareAmount: allocAmount,
            slippageBps: 50,
            userAddress: publicKey,
          },
        })

        updateStep(i, { status: 'done', hash: result.hash })

        onPositionAdded({
          amount: allocAmount,
          asset: alloc.asset,
          hash: result.hash,
          protocol: alloc.label,
          status: result.status,
          timestamp: new Date().toLocaleTimeString(),
          openedAt: Date.now(),
          apy: 0,
          category: alloc.category,
          poolId: alloc.poolId,
        })
      } catch (e) {
        updateStep(i, {
          status: 'error',
          error: e instanceof Error ? e.message : 'Transaction failed.',
        })
        break
      }
    }

    setExecuting(false)
    setDone(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0D0D12]/80 backdrop-blur-sm sm:items-center sm:px-4">
      <button className="absolute inset-0 cursor-default" onClick={onClose} type="button" />

      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/[0.12] bg-[#14141E] shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${bundle.dotColor}`} />
              <p className="text-xs uppercase tracking-[0.16em] text-[#9CA3AF]">{bundle.risk}</p>
            </div>
            <h2 className="mt-0.5 text-lg font-semibold text-[#F0F0F0]">{bundle.name} Bundle</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xl font-bold ${bundle.textColor}`}>{bundle.estApy.toFixed(1)}% est.</span>
            <button
              className="flex size-8 items-center justify-center rounded-full border border-white/[0.12] text-[#9CA3AF] transition hover:border-white/[0.25] hover:text-[#F0F0F0]"
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          {!executing && !done && (
            <>
              <label className="block text-sm font-medium text-[#F0F0F0]" htmlFor="bundle-amount">
                Total amount to invest
              </label>
              <div className="relative mt-1.5">
                <input
                  className="w-full rounded-xl border border-white/[0.12] bg-[#12121A] px-3 py-3 pr-24 text-[#F0F0F0] outline-none transition focus:border-[#F2C12E]"
                  id="bundle-amount"
                  max={maxAmount}
                  min={0}
                  onChange={(e) => setAmount(Math.min(Number(e.target.value), maxAmount))}
                  type="number"
                  value={amount}
                />
                <div className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-3">
                  <span className="text-sm font-medium text-[#9CA3AF]">USDC</span>
                  <button
                    className="rounded-md bg-[#F2C12E]/15 px-1.5 py-0.5 text-xs font-semibold text-[#F2C12E] hover:bg-[#F2C12E]/25"
                    onClick={() => setAmount(maxAmount)}
                    type="button"
                  >
                    Max
                  </button>
                </div>
              </div>

              {amount > 0 && (
                <div className="mt-4 space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9CA3AF]">
                    Allocation preview
                  </p>
                  {preview.map((alloc, i) => {
                    const barColors = ['bg-[#F2C12E]', 'bg-[#1E3A8A]', 'bg-[#16A34A]']
                    return (
                      <div className="flex items-center justify-between gap-4" key={alloc.poolId}>
                        <div className="flex items-center gap-2">
                          <span className={`size-2 rounded-full ${barColors[i % barColors.length]}`} />
                          <span className="text-sm text-[#9CA3AF]">{alloc.label}</span>
                        </div>
                        <span className="text-sm font-semibold text-[#F0F0F0]">
                          {alloc.amount.toFixed(2)} {alloc.asset}
                        </span>
                      </div>
                    )
                })}
              </div>
              )}

              {!isTestnet && isConnected && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F2C12E]/25 bg-[#F2C12E]/10 p-3 text-sm text-[#F0F0F0]">
                  <span className="shrink-0 text-[#F2C12E]">⚠</span>
                  <p>Switch Freighter to <strong>Testnet</strong> to execute bundles.</p>
                </div>
              )}

              <button
                className="mt-5 w-full rounded-xl bg-[#F2C12E] py-3.5 text-sm font-semibold text-[#0D0D12] transition hover:bg-[#F2C12E]/90 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canExecute}
                onClick={handleExecute}
                type="button"
              >
                {!isConnected ? 'Connect wallet' : !isTestnet ? 'Switch to Testnet' : `Execute ${bundle.allocations.length} transactions →`}
              </button>
              <p className="mt-2 text-center text-xs text-[#9CA3AF]">
                Each allocation is a separate Freighter signature
              </p>
            </>
          )}

          {(executing || done) && steps.length > 0 && (
            <div>
              <p className="mb-4 text-sm font-medium text-[#F0F0F0]">
                {done ? 'Execution complete' : 'Executing bundle…'}
              </p>
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div
                    className={`flex items-start gap-3 rounded-xl border p-4 transition-all duration-300 ${
                      step.status === 'done'
                        ? 'border-[#16A34A]/30 bg-[#16A34A]/10'
                        : step.status === 'running'
                          ? 'border-[#F2C12E]/30 bg-[#F2C12E]/10'
                          : step.status === 'error'
                            ? 'border-red-500/30 bg-red-500/10'
                            : 'border-white/[0.08] bg-white/[0.04]'
                    }`}
                    key={i}
                  >
                    <span
                      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        step.status === 'done'
                          ? 'bg-[#16A34A] text-[#0D0D12]'
                          : step.status === 'running'
                            ? 'bg-[#F2C12E] text-[#0D0D12]'
                            : step.status === 'error'
                              ? 'bg-red-500 text-white'
                              : 'border border-white/[0.2] bg-transparent text-[#9CA3AF]'
                      }`}
                    >
                      {step.status === 'done' ? '✓' : step.status === 'running' ? '…' : step.status === 'error' ? '✗' : String(i + 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#F0F0F0]">{step.label}</p>
                      {step.hash && (
                        <a
                          className="mt-1 block truncate font-terminal text-xs text-[#9CA3AF] underline underline-offset-4 hover:text-[#F0F0F0]"
                          href={`https://stellar.expert/explorer/testnet/tx/${step.hash}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {step.hash.slice(0, 20)}…
                        </a>
                      )}
                      {step.error && (
                        <p className="mt-1 text-xs text-red-400">{step.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {done && (
                <button
                  className="mt-5 w-full rounded-xl bg-[#F2C12E] py-3 text-sm font-semibold text-[#0D0D12] transition hover:bg-[#F2C12E]/90"
                  onClick={onClose}
                  type="button"
                >
                  Done — view positions
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Portfolio Allocation ─────────────────────────────────────────────────────

export function PortfolioAllocation({
  positions,
  riskProfile,
}: {
  positions: LocalPosition[]
  riskProfile: RiskProfile | null
}) {
  const totalValue = positions.reduce((sum, position) => (
    Number.isFinite(position.currentValueUsd) ? sum + Number(position.currentValueUsd) : sum
  ), 0)

  const categories: { id: string; label: string; color: string; bg: string; target?: number }[] = [
    { id: 'Lending', label: 'Lending', color: 'bg-[#F2C12E]', bg: 'bg-[#F2C12E]/10',
      target: riskProfile === 'Conservative' ? 100 : riskProfile === 'Moderate' ? 50 : 25 },
    { id: 'AMM LP', label: 'AMM LP', color: 'bg-[#1E3A8A]', bg: 'bg-[#1E3A8A]/10',
      target: riskProfile === 'Conservative' ? 0 : riskProfile === 'Moderate' ? 50 : 40 },
    { id: 'AMM Rewards', label: 'Rewards', color: 'bg-[#16A34A]', bg: 'bg-[#16A34A]/10',
      target: riskProfile === 'Conservative' ? 0 : riskProfile === 'Moderate' ? 0 : 35 },
  ]

  const stats = categories.map((cat) => {
    const value = positions
      .filter((p) => p.category === cat.id)
      .reduce((sum, position) => (
        Number.isFinite(position.currentValueUsd) ? sum + Number(position.currentValueUsd) : sum
      ), 0)
    const pct = totalValue > 0 ? (value / totalValue) * 100 : 0
    return { ...cat, value, pct }
  }).filter((c) => c.value > 0 || (c.target ?? 0) > 0)

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#12121A] p-5">
      <div className="mb-4 flex items-center justify-between">
        <SectionLabel>Portfolio Allocation</SectionLabel>
        <span className="font-terminal text-xs text-[#9CA3AF]">
          ~${totalValue.toFixed(0)} total
        </span>
      </div>

      <div className="space-y-3">
        {stats.map((cat) => (
          <div key={cat.id}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${cat.color}`} />
                <span className="font-medium text-[#F0F0F0]">{cat.label}</span>
              </div>
              <div className="flex items-center gap-3">
                {cat.target !== undefined && (
                  <span className="text-[#9CA3AF]">target {cat.target}%</span>
                )}
                <span className="font-semibold text-[#F0F0F0]">{cat.pct.toFixed(0)}%</span>
              </div>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.08]">
              {cat.target !== undefined && cat.target > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full border-r-2 border-white/[0.3] bg-transparent"
                  style={{ width: `${cat.target}%` }}
                />
              )}
              <div
                className={`h-full rounded-full transition-all duration-700 ${cat.color}`}
                style={{ width: `${Math.min(cat.pct, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {riskProfile && (
        <p className="mt-3 text-[10px] text-[#9CA3AF]">
          Dashed lines show target allocation for <strong>{riskProfile}</strong> profile
        </p>
      )}
    </div>
  )
}
