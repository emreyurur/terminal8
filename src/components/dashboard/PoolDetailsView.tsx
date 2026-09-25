import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { LockKeyhole, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import xlmLogo from '../../assets/xlm.svg'
import usdcLogo from '../../assets/usdc.svg'
import aquaLogo from '../../assets/aquaris.svg'
import { useWallet } from '../../context/useWallet'
import { usePoolRisk } from '../../hooks/usePoolRisk'
import { usePoolDashboard } from '../../hooks/usePoolDashboard'
import {
  executeApiPoolTransaction,
  fetchTransactionHistory,
  getOnChainLpShares,
  type ApiHistoryItem,
} from '../../services/terminal8Api'
import { computeWithdrawShares } from '../../lib/lpShares'
import { buildPositionMetricSeries, type PositionMetric, type PositionMetricPoint } from '../../lib/positionMetrics'
import { findActivePositionForPool } from '../../lib/vaultVoting'
import { SingleAssetDepositPanel } from './SingleAssetDepositPanel'
import { TransactionReceipt } from './TransactionReceipt'
import { executeOnChainTrustVote, fetchOnChainPoolScore } from '../../services/poolVotingContract'
import { estimateSecondaryAmount } from '../../services/soroswapLiquidity'
import { signTransaction } from '@stellar/freighter-api'
import type { DeFiPool, LocalPosition } from '../../types/stellar'

function getNowTimestamp(): number {
  return Date.now()
}

// ─── Token Avatars ────────────────────────────────────────────────────────────

const TOKEN_COLORS: Record<string, string> = {
  XLM: '#3b82f6',
  USDC: '#10b981',
  AQUA: '#06b6d4',
  BTC: '#f59e0b',
  ETH: '#8b5cf6',
  EURC: '#6366f1',
}

function tokenBg(code: string): string {
  if (TOKEN_COLORS[code]) return TOKEN_COLORS[code]
  const palette = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) & 0xfff
  return palette[h % palette.length]
}

function TokenAvatar({ code = 'XLM', size = 'md' }: { code?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'size-9 ring-2' : size === 'sm' ? 'size-5 ring-1' : 'size-7 ring-2'
  const safeCode = typeof code === 'string' && code ? code : 'XLM'
  const upper = safeCode.toUpperCase()
  if (upper === 'XLM' || upper === 'YXLM') {
    return (
      <img
        alt={code}
        className={`shrink-0 rounded-full bg-[#12121A] p-0.5 ring-[#0D0D12] ${dims}`}
        src={xlmLogo}
      />
    )
  }
  if (upper === 'USDC') {
    return (
      <img
        alt={code}
        className={`shrink-0 rounded-full bg-[#12121A] p-0.5 ring-[#0D0D12] ${dims}`}
        src={usdcLogo}
      />
    )
  }
  if (upper === 'AQUA') {
    return (
      <img
        alt={code}
        className={`shrink-0 rounded-full bg-[#12121A] p-0.5 ring-[#0D0D12] ${dims}`}
        src={aquaLogo}
      />
    )
  }

  const textDims = size === 'lg' ? 'size-9 ring-2' : size === 'sm' ? 'size-5 ring-1' : 'size-7 ring-2'
  const svgDims = size === 'lg' ? 'size-4' : size === 'sm' ? 'size-2.5' : 'size-3.5'
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full text-white shadow-inner ring-[#111827] ${textDims}`}
      style={{ backgroundColor: tokenBg(code) }}
      title={code}
    >
      <svg className={`${svgDims} opacity-90`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    </div>
  )
}

// ─── Chart Data Generator ─────────────────────────────────────────────────────

// ─── Custom Pure SVG Interactive Area Chart (Zero External Dependencies) ───────

function PerformanceAreaChart({
  data,
  metric,
}: {
  data: Array<{ date: string; apy: number; tvl: number }>
  metric: 'apy' | 'tvl'
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const values = data.map((d) => {
    const raw = metric === 'apy' ? Number(d.apy) : Number(d.tvl)
    return Number.isFinite(raw) ? raw : 0
  })
  const minVal = (Math.min(...values) || 0) * 0.94
  const maxVal = (Math.max(...values) || 10) * 1.05
  const range = Math.max(0.001, maxVal - minVal)

  const width = 640
  const height = 220
  const padX = 16
  const padTop = 16
  const padBottom = 28
  const chartW = width - padX * 2
  const chartH = height - padTop - padBottom

  const pts = data.map((d, i) => {
    const val = metric === 'apy' ? d.apy : d.tvl
    const x = padX + (i / Math.max(1, data.length - 1)) * chartW
    const y = padTop + chartH - ((val - minVal) / range) * chartH
    return { x, y, val, date: d.date }
  })

  // Build SVG path
  const linePath = pts
    .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
    .join(' ')

  const areaPath = pts.length
    ? `${linePath} L ${pts[pts.length - 1].x},${padTop + chartH} L ${pts[0].x},${padTop + chartH} Z`
    : ''

  const color = metric === 'apy' ? '#3B82F6' : '#16A34A'
  const activePt = hoverIdx !== null ? pts[hoverIdx] : pts[pts.length - 1]

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !data.length) return
    const rect = svgRef.current.getBoundingClientRect()
    const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const ratio = relX / rect.width
    const idx = Math.round(ratio * (data.length - 1))
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)))
  }

  return (
    <div className="relative w-full select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`areaGrad-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((f, idx) => {
          const gy = padTop + chartH * f
          return (
            <line
              key={idx}
              x1={padX}
              y1={gy}
              x2={width - padX}
              y2={gy}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="4 4"
            />
          )
        })}

        {/* Filled Area */}
        <path d={areaPath} fill={`url(#areaGrad-${metric})`} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Hover vertical guide line */}
        {activePt && (
          <line
            x1={activePt.x}
            y1={padTop}
            x2={activePt.x}
            y2={padTop + chartH}
            stroke={color}
            strokeDasharray="3 3"
            strokeOpacity="0.5"
          />
        )}

        {/* Active glowing dot */}
        {activePt && (
          <circle
            cx={activePt.x}
            cy={activePt.y}
            r="5"
            fill="#0D0D12"
            stroke={color}
            strokeWidth="3"
          />
        )}

        {/* Bottom X-axis Date Labels */}
        <g className="text-[10px] fill-[#6B7280]">
          {pts
            .filter((_, idx) => idx === 0 || idx === Math.floor(pts.length / 2) || idx === pts.length - 1)
            .map((p, idx) => (
              <text
                key={idx}
                x={p.x}
                y={height - 6}
                textAnchor={idx === 0 ? 'start' : idx === 2 ? 'end' : 'middle'}
              >
                {p.date}
              </text>
            ))}
        </g>
      </svg>

      {/* Interactive Tooltip Badge */}
      {activePt && (
        <div className="absolute top-0 right-2 flex items-center gap-3 rounded-xl border border-white/[0.12] bg-[#0D0D14]/90 px-3.5 py-1.5 text-xs shadow-xl backdrop-blur-md">
          <span className="text-[#9CA3AF]">{activePt.date}</span>
          <span className="font-mono font-bold text-white">
            {metric === 'apy'
              ? `${(Number.isFinite(Number(activePt.val)) ? Number(activePt.val) : 0).toFixed(2)}% APY`
              : `$${((Number.isFinite(Number(activePt.val)) ? Number(activePt.val) : 0) / 1_000_000).toFixed(2)}M`}
          </span>
        </div>
      )}
    </div>
  )
}

function PositionMetricChart({ data, metric }: { data: PositionMetricPoint[]; metric: PositionMetric }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const width = 640
  const height = 220
  const padX = 18
  const padTop = 18
  const padBottom = 28
  const chartWidth = width - padX * 2
  const chartHeight = height - padTop - padBottom
  const values = data.map((point) => Number(point.value) || 0)
  const minValue = Math.min(...values, 0)
  const maxValue = Math.max(...values, 0)
  const range = Math.max(1, maxValue - minValue)
  const color = metric === 'interest' ? '#35D49A' : metric === 'apy' ? '#F2C12E' : '#3B82F6'
  const points = data.map((point, index) => ({
    ...point,
    x: data.length === 1 ? width / 2 : padX + (index / (data.length - 1)) * chartWidth,
    y: padTop + chartHeight - ((point.value - minValue) / range) * chartHeight,
  }))
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ')
  const areaPath = points.length > 1
    ? `${linePath} L ${points.at(-1)?.x},${padTop + chartHeight} L ${points[0].x},${padTop + chartHeight} Z`
    : ''
  const activePoint = points[hoverIndex ?? Math.max(0, points.length - 1)]

  const formatValue = (value: number) => metric === 'apy'
    ? `${value.toFixed(2)}%`
    : value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return
    const rect = svgRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    setHoverIndex(Math.round(ratio * (points.length - 1)))
  }

  return (
    <div className="relative h-full w-full select-none">
      <svg ref={svgRef} className="size-full overflow-visible" onMouseLeave={() => setHoverIndex(null)} onMouseMove={handleMouseMove} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={`position-metric-${metric}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((fraction) => (
          <line key={fraction} x1={padX} x2={width - padX} y1={padTop + chartHeight * fraction} y2={padTop + chartHeight * fraction} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
        ))}
        {areaPath && <path d={areaPath} fill={`url(#position-metric-${metric})`} />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />}
        {activePoint && <circle cx={activePoint.x} cy={activePoint.y} fill="#111119" r="5" stroke={color} strokeWidth="3" />}
        {points.filter((_, index) => index === 0 || index === Math.floor(points.length / 2) || index === points.length - 1).map((point, index) => (
          <text key={`${point.timestamp}-${index}`} className="fill-[#6B7280] text-[10px]" textAnchor={index === 0 ? 'start' : index === 2 ? 'end' : 'middle'} x={point.x} y={height - 6}>{point.date}</text>
        ))}
      </svg>
      {activePoint && (
        <div className="absolute right-2 top-0 rounded-md border border-white/[0.1] bg-[#0D0D14]/90 px-3 py-1.5 text-xs shadow-xl backdrop-blur-md">
          <span className="mr-3 text-[#9CA3AF]">{activePoint.date}</span>
          <span className="font-mono font-semibold text-white">{formatValue(activePoint.value)}</span>
        </div>
      )}
    </div>
  )
}

function DepositModeToggle({
  mode,
  onChange,
}: {
  mode: 'both' | 'single'
  onChange: (mode: 'both' | 'single') => void
}) {
  const options: { id: 'both' | 'single'; label: string }[] = [
    { id: 'both', label: 'Both assets' },
    { id: 'single', label: 'Single asset' },
  ]
  return (
    <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.05] p-1" role="tablist">
      {options.map((o) => (
        <button
          aria-selected={mode === o.id}
          className={`rounded-lg py-2 text-xs font-semibold transition ${
            mode === o.id ? 'bg-[#F2C12E] text-[#0D0D12]' : 'text-[#9CA3AF] hover:text-white'
          }`}
          key={o.id}
          onClick={() => onChange(o.id)}
          role="tab"
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main Kamino-Style Pool Details View ──────────────────────────────────────

export function PoolDetailsView({
  available,
  initialTab = 'overview',
  onBack,
  onTabChange,
  onPositionAdded,
  onPositionRemoved,
  pool,
  userPositions = [],
}: {
  available: number
  initialTab?: 'overview' | 'position'
  onBack: () => void
  onTabChange?: (tab: 'overview' | 'position') => void
  onPositionAdded: (pos: Omit<LocalPosition, 'id'>) => void
  onPositionRemoved?: (id: string, amount: number) => void
  pool: DeFiPool
  userPositions?: LocalPosition[]
}) {
  const { connect, networkPassphrase, networkUrl, publicKey, status } = useWallet()
  const riskState = usePoolRisk(pool.id)
  const dashboardState = usePoolDashboard(pool.id)

  // Page Navigation Tabs: 'overview' | 'position'
  const [activePageTab, setActivePageTab] = useState<'overview' | 'position'>(initialTab)

  useEffect(() => {
    queueMicrotask(() => {
      setActivePageTab(initialTab)
    })
  }, [initialTab])

  const selectPageTab = (tab: 'overview' | 'position') => {
    setActivePageTab(tab)
    onTabChange?.(tab)
  }

  // Chart Metric & Timeframe
  const [chartMetric, setChartMetric] = useState<'apy' | 'tvl'>('apy')
  const [timeframe, setTimeframe] = useState<7 | 30 | 90>(30)
  const [positionChartMetric, setPositionChartMetric] = useState<PositionMetric>('value')
  const [positionTimeframe, setPositionTimeframe] = useState<7 | 30>(30)

  // Deposit Form State
  const [amount, setAmount] = useState<number>(0)
  const [depositMode, setDepositMode] = useState<'both' | 'single'>('both')
  const [txState, setTxState] = useState<'idle' | 'signing' | 'submitted' | 'error'>('idle')
  const [txMessage, setTxMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [optimisticPosition, setOptimisticPosition] = useState<LocalPosition | null>(null)

  // Withdraw State (for My Position tab)
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0)
  const [withdrawTxState, setWithdrawTxState] = useState<'idle' | 'signing' | 'submitted' | 'error'>('idle')
  const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null)
  const [withdrawTxMessage, setWithdrawTxMessage] = useState<string | null>(null)
  const [actionTab, setActionTab] = useState<'deposit' | 'withdraw'>('deposit')

  // Vote totals always come from the deployed Soroban contract.
  const [onChainVotes, setOnChainVotes] = useState<{ upvotes: number; downvotes: number } | null>(null)
  const [voteScoreStatus, setVoteScoreStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [userVote, setUserVote] = useState<'up' | 'down' | null>(null)
  const [voteNotice, setVoteNotice] = useState<{
    type: 'error' | 'success' | 'info'
    text: string
    hash?: string
  } | null>(null)
  const [voting, setVoting] = useState(false)

  const refreshOnChainVotes = useCallback(async () => {
    setVoteScoreStatus('loading')
    try {
      const score = await fetchOnChainPoolScore(pool.id)
      if (!score) {
        setOnChainVotes(null)
        setVoteScoreStatus('unavailable')
        return null
      }

      setOnChainVotes(score)
      setVoteScoreStatus('ready')
      return score
    } catch {
      setOnChainVotes(null)
      setVoteScoreStatus('unavailable')
      return null
    }
  }, [pool.id])

  useEffect(() => {
    queueMicrotask(() => {
      setUserVote(null)
      void refreshOnChainVotes()
    })
  }, [refreshOnChainVotes, publicKey])

  const [historyItems, setHistoryItems] = useState<ApiHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState<boolean>(false)

  useEffect(() => {
    if (!publicKey) {
      queueMicrotask(() => setHistoryItems([]))
      return
    }
    queueMicrotask(() => setHistoryLoading(true))
    fetchTransactionHistory(20, 1)
      .then((items) => {
        const filtered = (items ?? []).filter(
          (item) => item.poolId === pool.id || String(item.asset || item.tokenCode || '').toUpperCase() === String(pool.asset).toUpperCase(),
        )
        setHistoryItems(filtered)
      })
      .catch(() => {
        setHistoryItems([])
      })
      .finally(() => {
        setHistoryLoading(false)
      })
  }, [pool.id, pool.asset, publicKey])

  const isTestnet = networkPassphrase?.toLowerCase().includes('test') ?? false
  const isConnected = status === 'CONNECTED' && Boolean(publicKey) && Boolean(networkUrl) && Boolean(networkPassphrase)
  const canSign = isConnected && isTestnet

  const isLP = pool.category === 'AMM LP' || pool.category === 'AMM Rewards'
  const secondaryAsset = pool.secondaryAsset
  const secondaryAmount = isLP && secondaryAsset
    ? estimateSecondaryAmount(pool.asset, amount, secondaryAsset, pool.reserveA, pool.reserveB)
    : 0

  const safeApy = Number.isFinite(Number(pool.apy)) ? Number(pool.apy) : 0

  const hasConfirmedPosition = optimisticPosition
    ? userPositions.some((position) => position.hash === optimisticPosition.hash)
    : false
  const visiblePositions = optimisticPosition && !hasConfirmedPosition
    ? [optimisticPosition, ...userPositions]
    : userPositions
  const myPosition = findActivePositionForPool(visiblePositions, pool)
  const rawAmount = Number(myPosition?.amount)
  const suppliedAmount = Number.isFinite(rawAmount) ? rawAmount : 0
  const apiPositionValueUsd = Number(myPosition?.currentValueUsd)
  const hasPositionValue = Boolean(myPosition) && Number.isFinite(apiPositionValueUsd)
  const suppliedUsdValue = hasPositionValue ? apiPositionValueUsd : 0
  const apiSharesOwned = Number(myPosition?.sharesOwned)
  const displayedShares = Number.isFinite(apiSharesOwned) ? apiSharesOwned : suppliedAmount
  const apiPositionPnlUsd = Number(myPosition?.pnlUsd)
  const hasPositionPnl = Boolean(myPosition) && Number.isFinite(apiPositionPnlUsd)
  const safeEarnedUsd = hasPositionPnl ? apiPositionPnlUsd : 0
  const voteControlsDisabled = voting || !myPosition || !canSign || voteScoreStatus !== 'ready'
  const trustedVotes = voteScoreStatus === 'loading' ? '...' : voteScoreStatus === 'ready' ? String(onChainVotes?.upvotes ?? 0) : '--'
  const riskyVotes = voteScoreStatus === 'loading' ? '...' : voteScoreStatus === 'ready' ? String(onChainVotes?.downvotes ?? 0) : '--'

  const handleTrustVote = async (isUpvote: boolean) => {
    setVoteNotice(null)
    if (!myPosition) {
      setVoteNotice({
        type: 'error',
        text: 'Only wallets with an active position in this vault can vote.',
      })
      return
    }

    if (!publicKey || !networkUrl || !networkPassphrase) {
      setVoteNotice({
        type: 'error',
        text: 'Connect your wallet to sign the on-chain vote.',
      })
      return
    }

    if (userVote === (isUpvote ? 'up' : 'down')) {
      return
    }

    try {
      setVoting(true)
      setVoteNotice({
        type: 'info',
        text: 'Approve the on-chain governance vote in your wallet.',
      })

      const res = await executeOnChainTrustVote({
        publicKey,
        poolId: pool.id,
        isUpvote,
        horizonUrl: networkUrl,
        networkPassphrase,
      })

      const nextUserVote = isUpvote ? 'up' : 'down'
      setUserVote(nextUserVote)
      await refreshOnChainVotes()

      setVoteNotice({
        type: 'success',
        text: 'On-chain vault vote confirmed on Stellar Testnet.',
        hash: res.hash,
      })
    } catch (err: unknown) {
      setVoteNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Vote transaction failed or cancelled.',
      })
    } finally {
      setVoting(false)
    }
  }

  // Missing backend metrics stay unavailable instead of being replaced with demo values.
  const safeTvlRaw = Number.isFinite(Number(pool.tvlRaw)) ? Number(pool.tvlRaw) : 0

  const apiDashboard = dashboardState.status === 'success' ? dashboardState.data : undefined
  const vaultOverview = apiDashboard?.vaultOverview

  const hasVaultOverview = Boolean(vaultOverview)
  const utilizationPct = hasVaultOverview && Number.isFinite(Number(vaultOverview?.utilization))
    ? Number(vaultOverview?.utilization)
    : Number.isFinite(Number(pool.utilization)) ? Number(pool.utilization) : 0

  const rawSupplied = Number(vaultOverview?.totalSupplied)
  const suppliedVal = hasVaultOverview && Number.isFinite(rawSupplied) ? rawSupplied : safeTvlRaw
  const rawBorrowed = Number(vaultOverview?.totalBorrowed)
  const borrowedVal = hasVaultOverview && Number.isFinite(rawBorrowed) ? rawBorrowed : safeTvlRaw * (utilizationPct / 100)

  const totalSuppliedUsd = hasVaultOverview ? (suppliedVal >= 1_000_000
    ? `$${(suppliedVal / 1_000_000).toFixed(2)}M`
    : `$${suppliedVal.toFixed(0)}`) : pool.tvl
  const totalBorrowedUsd = borrowedVal >= 1_000_000
    ? `$${(borrowedVal / 1_000_000).toFixed(2)}M`
    : `$${borrowedVal.toFixed(0)}`
  const rawSupplyApy = Number(vaultOverview?.supplyApy)
  const supplyApy = hasVaultOverview && Number.isFinite(rawSupplyApy) ? rawSupplyApy : safeApy
  const rawAvg90 = Number(vaultOverview?.supplyApy90dAvg)
  const avgApy90d = hasVaultOverview && Number.isFinite(rawAvg90) ? rawAvg90 : supplyApy

  // Chart data
  const chartData = useMemo(() => {
    if (apiDashboard?.chartData && Array.isArray(apiDashboard.chartData)) {
      const valid = apiDashboard.chartData
        .map((point) => ({ ...point, time: new Date(point.timestamp).getTime() }))
        .filter((point) => Number.isFinite(point.time))
        .sort((a, b) => a.time - b.time)
      const latest = valid.at(-1)?.time
      const cutoff = latest === undefined ? 0 : latest - timeframe * 24 * 60 * 60 * 1000
      return valid.filter((point) => point.time >= cutoff).map((pt) => {
        const d = new Date(pt.timestamp)
        return {
          date: isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          apy: Number.isFinite(Number(pt.supplyApy)) ? Number(pt.supplyApy) : 0,
          tvl: Number.isFinite(Number(pt.totalSupply)) ? Number(pt.totalSupply) : 0,
        }
      })
    }
    return []
  }, [apiDashboard, timeframe])

  const positionChartData = useMemo(() => buildPositionMetricSeries({
    currentInterestUsd: safeEarnedUsd,
    currentValueUsd: suppliedUsdValue,
    days: positionTimeframe,
    metric: positionChartMetric,
    snapshots: apiDashboard?.chartData ?? [],
  }), [apiDashboard?.chartData, positionChartMetric, positionTimeframe, safeEarnedUsd, suppliedUsdValue])

  const recordPosition = (position: Omit<LocalPosition, 'id'>) => {
    setOptimisticPosition({
      ...position,
      id: `confirmed-${position.hash || pool.id}`,
    })
    onPositionAdded(position)
  }

  const handleDeposit = async () => {
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
      recordPosition({
        amount: Number.isFinite(Number(amount)) ? Number(amount) : 0,
        asset: pool.asset || 'XLM',
        hash: result.hash,
        protocol: pool.protocol || 'Soroswap AMM',
        status: result.status || 'SUCCESS',
        timestamp: new Date().toLocaleTimeString(),
        openedAt: getNowTimestamp(),
        apy: safeApy,
        category: pool.category || 'AMM LP',
        poolId: pool.id,
      })
      selectPageTab('position')
    } catch (error) {
      setTxState('error')
      setTxMessage(error instanceof Error ? error.message : 'Transaction failed.')
    }
  }

  const handleWithdraw = async (pos: LocalPosition) => {
    if (!isConnected || !publicKey || !networkUrl || !networkPassphrase || !isTestnet) return
    try {
      setWithdrawTxState('signing')
      setWithdrawTxMessage(null)
      const amountToWithdraw = withdrawAmount || pos.amount
      // The chain withdraws LP shares, not the recorded position amount: map the selection onto the real share balance.
      const onChainShares = await getOnChainLpShares(networkUrl, publicKey, pool.id)
      const shareAmount = computeWithdrawShares(onChainShares, amountToWithdraw, pos.amount)
      if (!(shareAmount > 0)) {
        throw new Error('No LP shares found for this pool in your wallet.')
      }
      const result = await executeApiPoolTransaction({
        publicKey,
        signTransactionFn: signTransaction,
        params: {
          poolId: pool.id,
          action: 'WITHDRAW',
          amountA: amountToWithdraw,
          amountB: 0,
          shareAmount,
          slippageBps: 50,
          userAddress: publicKey,
        },
      })
      setWithdrawTxState('submitted')
      setWithdrawTxHash(result.hash)
      if (onPositionRemoved) {
        onPositionRemoved(pos.id, amountToWithdraw)
      }
    } catch (error) {
      setWithdrawTxState('error')
      setWithdrawTxMessage(error instanceof Error ? error.message : 'Withdraw failed.')
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-200">
      {/* ── Breadcrumb & Navigation Bar ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.10] bg-[#12121A] text-[#9CA3AF] transition hover:border-white/[0.22] hover:text-white"
            title="Back to Vaults"
            type="button"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex shrink-0">
              <TokenAvatar code={pool.asset} size="lg" />
              {pool.secondaryAsset && (
                <div className="-ml-3">
                  <TokenAvatar code={pool.secondaryAsset} size="lg" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-white sm:text-2xl">
                  {pool.protocol} {pool.asset} Prime
                </h1>
                {riskState.status === 'success' ? (
                  <span className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-xs font-semibold text-[#F2C12E]">
                    {riskState.data.riskLevel === 'MEDIUM'
                      ? 'Balanced'
                      : riskState.data.riskLevel === 'LOW' ? 'Conservative' : 'Aggressive'}
                  </span>
                ) : (
                  <span className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium text-[#7D899A]">
                    {riskState.status === 'loading' || riskState.status === 'idle' ? 'Loading risk data' : 'Risk unavailable'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Header Metadata (matching Kamino) */}
        <div className="flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[#9CA3AF]">Vault Token</span>
            <div className="flex items-center gap-1.5 font-bold text-white">
              <TokenAvatar code={pool.asset} size="sm" />
              <span>{pool.asset}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs (Vault Overview | My Position) ── */}
      <div className="mb-6 flex gap-8 border-b border-white/[0.08]">
        <button
          onClick={() => selectPageTab('overview')}
          className={`relative pb-3 text-sm font-semibold transition ${activePageTab === 'overview'
              ? 'text-white'
              : 'text-[#9CA3AF] hover:text-white'
            }`}
          type="button"
        >
          Vault Overview
          {activePageTab === 'overview' && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#3B82F6]" />
          )}
        </button>

        <button
          onClick={() => selectPageTab('position')}
          className={`relative pb-3 text-sm font-semibold transition ${activePageTab === 'position'
              ? 'text-white'
              : 'text-[#9CA3AF] hover:text-white'
            }`}
          type="button"
        >
          My Position
          {visiblePositions.length > 0 && (
            <span className="ml-2 rounded-full bg-[#16A34A]/20 px-2 py-0.5 text-xs font-bold text-[#16A34A]">
              {visiblePositions.length}
            </span>
          )}
          {activePageTab === 'position' && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#3B82F6]" />
          )}
        </button>
      </div>

      {/* ── Stat Cards Strip (Vault Overview vs My Position) ── */}
      {activePageTab === 'overview' ? (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-5">
            <p className="font-mono text-xl font-extrabold text-white sm:text-2xl">{totalSuppliedUsd}</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">Total Supplied</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-5">
            <p className="font-mono text-xl font-extrabold text-white sm:text-2xl">{totalBorrowedUsd}</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">Total Borrowed</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-5">
            <p className="font-mono text-xl font-extrabold text-white sm:text-2xl">{utilizationPct.toFixed(2)}%</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">Utilization</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-5">
            <p className="font-mono text-xl font-extrabold text-[#16A34A] sm:text-2xl">{supplyApy.toFixed(2)}%</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">Supply APY</p>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-2xl border border-white/[0.08] bg-[#111119] p-5">
            <p className="font-mono text-xl font-extrabold text-[#16A34A] sm:text-2xl">{avgApy90d.toFixed(2)}%</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">Supply APY (90D Avg)</p>
          </div>
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-5">
            <p className="font-mono text-xl font-extrabold text-white sm:text-2xl">{hasPositionValue ? `$${suppliedUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--'}</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">Position Value</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-5">
            <p className="font-mono text-xl font-extrabold text-white sm:text-2xl">
              {displayedShares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              <span className="ml-1 text-xs font-normal text-[#9CA3AF]">{pool.asset}</span>
            </p>
            <p className="mt-1 text-xs text-[#9CA3AF]">Staked Shares</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-5">
            <p className="font-mono text-xl font-extrabold text-[#16A34A] sm:text-2xl">{hasPositionPnl ? `+$${safeEarnedUsd.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : '--'}</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">Interest Earned</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-5">
            <p className="font-mono text-xl font-extrabold text-[#16A34A] sm:text-2xl">{hasPositionValue ? `+$${(suppliedUsdValue * (supplyApy / 100) / 365).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : '--'}</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">Daily Interest</p>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-2xl border border-white/[0.08] bg-[#111119] p-5">
            <p className="font-mono text-xl font-extrabold text-[#F2C12E] sm:text-2xl">{supplyApy.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">Current APY</p>
          </div>
        </div>
      )}

      {/* ── Unified 2-Column Content (Left: Overview/Position, Right: Deposit/Withdraw) ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-start">
        {/* Left Column */}
        <div className="space-y-6">
          {activePageTab === 'overview' ? (
            <>
              {/* Vault profile and on-chain voting */}
              <div className="rounded-2xl border border-[#F2C12E]/30 bg-[#161622] p-6 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-white">Vault Profile & On-Chain Votes</h2>
                      {riskState.status === 'success' ? (
                        <span className="rounded-md bg-[#16A34A]/20 px-2.5 py-0.5 text-xs font-bold text-[#16A34A]">
                          {riskState.data.compositeScore}/100 · {riskState.data.riskLevel}
                        </span>
                      ) : (
                        <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium text-[#9CA3AF]">
                          Risk data unavailable
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-[#9CA3AF]">
                      {myPosition
                        ? 'Your active position is eligible to vote. Totals are read directly from the Soroban contract.'
                        : 'Open and keep an active position in this vault to vote. Contract totals remain public.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      aria-label={`Vote trusted. Current on-chain votes: ${trustedVotes}`}
                      disabled={voteControlsDisabled}
                      onClick={() => handleTrustVote(true)}
                      className={`flex h-10 items-center gap-2 rounded-lg border px-3.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                        userVote === 'up'
                          ? 'border-[#16A34A] bg-[#16A34A]/20 text-[#16A34A]'
                          : 'border-white/[0.12] bg-white/[0.06] text-[#F0F0F0] hover:border-[#16A34A]/40 hover:bg-[#16A34A]/10 hover:text-[#16A34A]'
                      }`}
                    >
                      <ThumbsUp className="size-4" aria-hidden="true" />
                      <span>Trusted</span>
                      <span className="min-w-5 text-right font-mono tabular-nums">{trustedVotes}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Vote risky. Current on-chain votes: ${riskyVotes}`}
                      disabled={voteControlsDisabled}
                      onClick={() => handleTrustVote(false)}
                      className={`flex h-10 items-center gap-2 rounded-lg border px-3.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                        userVote === 'down'
                          ? 'border-red-400 bg-red-400/20 text-red-400'
                          : 'border-white/[0.12] bg-white/[0.06] text-[#F0F0F0] hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-400'
                      }`}
                    >
                      <ThumbsDown className="size-4" aria-hidden="true" />
                      <span>Risky</span>
                      <span className="min-w-5 text-right font-mono tabular-nums">{riskyVotes}</span>
                    </button>
                  </div>
                </div>

                {(!myPosition || !canSign || voteScoreStatus !== 'ready') && (
                  <div className="mt-4 flex min-h-8 items-center justify-between gap-3 border-t border-white/[0.07] pt-4 text-xs">
                    <span className="flex items-center gap-2 text-[#8793A5]">
                      {!myPosition && <LockKeyhole className="size-3.5" aria-hidden="true" />}
                      {!myPosition
                        ? 'Voting locked until this wallet has an active position.'
                        : !canSign
                          ? 'Connect a Testnet wallet to vote.'
                          : voteScoreStatus === 'loading'
                            ? 'Reading vote totals from Soroban...'
                            : 'On-chain vote totals are currently unavailable.'}
                    </span>
                    {voteScoreStatus === 'unavailable' && (
                      <button className="inline-flex shrink-0 items-center gap-1.5 text-[#D9B73A] hover:text-[#F2C12E]" onClick={() => void refreshOnChainVotes()} type="button">
                        <RefreshCw className="size-3.5" aria-hidden="true" />
                        Retry
                      </button>
                    )}
                  </div>
                )}

                {voteNotice && (
                  <div
                    className={`mt-4 rounded-xl border px-4 py-3 text-xs font-semibold ${
                      voteNotice.type === 'error'
                        ? 'border-red-400/30 bg-red-400/10 text-red-300'
                        : voteNotice.type === 'info'
                        ? 'border-blue-400/30 bg-blue-400/10 text-blue-300'
                        : 'border-[#16A34A]/30 bg-[#16A34A]/10 text-[#16A34A]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{voteNotice.text}</span>
                      {voteNotice.hash && (
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${voteNotice.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 underline hover:opacity-80"
                        >
                          View TX ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Performance History / APY Chart Card */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-6">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setChartMetric('apy')}
                      className={`pb-1 text-sm font-semibold transition ${chartMetric === 'apy' ? 'border-b-2 border-[#3B82F6] text-white' : 'text-[#9CA3AF] hover:text-white'
                        }`}
                      type="button"
                    >
                      Supply APY
                    </button>
                    <button
                      onClick={() => setChartMetric('tvl')}
                      className={`pb-1 text-sm font-semibold transition ${chartMetric === 'tvl' ? 'border-b-2 border-[#3B82F6] text-white' : 'text-[#9CA3AF] hover:text-white'
                        }`}
                      type="button"
                    >
                      Total Supply
                    </button>
                  </div>

                  <div className="flex items-center rounded-xl bg-white/[0.04] p-1 text-xs font-semibold">
                    {([7, 30, 90] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTimeframe(t)}
                        className={`rounded-lg px-3 py-1 transition ${timeframe === t ? 'bg-[#3B82F6] text-white' : 'text-[#9CA3AF] hover:text-white'
                          }`}
                        type="button"
                      >
                        {t === 90 ? '3M' : `${t}D`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interactive Area Chart */}
                <div className="h-64 w-full">
                  {dashboardState.status === 'loading' || dashboardState.status === 'idle' ? (
                    <div className="flex size-full items-center justify-center text-sm text-[#7D899A]">Loading pool snapshots...</div>
                  ) : chartData.length > 0 ? (
                    <PerformanceAreaChart data={chartData} metric={chartMetric} />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm text-[#7D899A]">No historical pool snapshots are available.</div>
                  )}
                </div>
              </div>

              {/* Pool Risk Telemetry Card */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-6">
                {riskState.status === 'loading' || riskState.status === 'idle' ? (
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 w-1/3 rounded-full bg-white/[0.08]" />
                    <div className="h-4 w-2/3 rounded-full bg-white/[0.08]" />
                  </div>
                ) : riskState.status === 'error' ? (
                  <p className="text-sm text-[#9CA3AF]">Could not load live risk telemetry.</p>
                ) : (
                  <div>
                    <div className="mb-6 flex items-center justify-between">
                      <span className="text-sm text-[#9CA3AF]">Health Score</span>
                      <span className="font-mono text-xl font-bold text-[#16A34A]">{riskState.data.compositeScore} / 100</span>
                    </div>
                    <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                      {[
                        { label: 'Audit Security', score: riskState.data.trustScore },
                        { label: 'Liquidity Depth', score: riskState.data.tvlScore },
                        { label: 'Vol Stability', score: riskState.data.volatilityScore },
                        { label: 'APY Health', score: riskState.data.apyScore },
                      ].map((metric) => (
                        <div key={metric.label}>
                          <div className="mb-2 flex items-center justify-between text-xs">
                            <span className="text-[#9CA3AF]">{metric.label}</span>
                            <span className="font-semibold text-white">{metric.score}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${metric.score}%`,
                                backgroundColor: metric.score > 70 ? '#16A34A' : metric.score > 40 ? '#F2C12E' : '#ef4444'
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Left Column: My Position View (Matching Screenshot 2) */
            <div className="space-y-6">
              {suppliedAmount === 0 ? (
                <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-12 text-center">
                  <p className="text-base font-semibold text-white">No active position in this vault</p>
                  <p className="mt-1 text-sm text-[#9CA3AF]">Use the deposit panel on the right to start earning {safeApy.toFixed(2)}% APY.</p>
                  <button
                    onClick={() => setActionTab('deposit')}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#F2C12E] px-6 py-3 text-xs font-black uppercase tracking-wider text-[#0D0D12] transition hover:bg-[#e0b429]"
                    type="button"
                  >
                    <span>Deposit Now</span>
                    <svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={3.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Performance Chart */}
                  <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-6">
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
                      <div className="flex items-center gap-5" role="tablist" aria-label="Position chart metric">
                        {([
                          { id: 'value' as const, label: 'Position Value' },
                          { id: 'interest' as const, label: 'Interest Earned' },
                          { id: 'apy' as const, label: 'Avg APY' },
                        ]).map((metric) => (
                          <button
                            aria-selected={positionChartMetric === metric.id}
                            className={`pb-2 text-sm font-semibold transition ${positionChartMetric === metric.id ? 'border-b-2 border-[#3B82F6] text-white' : 'text-[#9CA3AF] hover:text-white'}`}
                            key={metric.id}
                            onClick={() => setPositionChartMetric(metric.id)}
                            role="tab"
                            type="button"
                          >
                            {metric.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-[#3B82F6] px-2.5 py-1 text-xs font-bold text-white">{positionChartMetric === 'apy' ? '%' : 'USD'}</span>
                        {([7, 30] as const).map((days) => (
                          <button
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${positionTimeframe === days ? 'bg-white/[0.1] text-white' : 'bg-white/[0.04] text-[#9CA3AF] hover:text-white'}`}
                            key={days}
                            onClick={() => setPositionTimeframe(days)}
                            type="button"
                          >
                            {days}D
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-64 w-full">
                      {dashboardState.status === 'loading' || dashboardState.status === 'idle' ? (
                        <div className="flex size-full items-center justify-center text-sm text-[#7D899A]">Loading position snapshots...</div>
                      ) : positionChartData.length > 0 ? (
                        <PositionMetricChart data={positionChartData} metric={positionChartMetric} />
                      ) : (
                        <div className="flex size-full flex-col items-center justify-center gap-1 text-center">
                          <p className="text-sm text-[#A5B1C2]">No historical position data yet</p>
                          <p className="text-xs text-[#657284]">The chart will appear after the pool dashboard records snapshots.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Transaction History Section (Matched with user screenshot & /history API) */}
                  <div className="rounded-2xl border border-white/[0.08] bg-[#111119] p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold text-white">Transaction History</h3>
                      {historyLoading && (
                        <span className="text-xs text-[#9CA3AF] animate-pulse">Syncing with /history API...</span>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <div className="min-w-[600px]">
                        <div className="grid grid-cols-[minmax(160px,1.5fr)_120px_minmax(140px,1.2fr)_120px_50px] items-center gap-4 border-b border-white/[0.08] pb-3 px-3 text-xs font-semibold text-[#9CA3AF]">
                          <span className="inline-flex items-center gap-1 cursor-pointer hover:text-white select-none">
                            Date
                            <svg className="size-3.5 stroke-current stroke-2 shrink-0" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </span>
                          <span className="inline-flex items-center gap-1 cursor-pointer hover:text-white select-none">
                            Type
                            <svg className="size-3.5 stroke-current stroke-2 shrink-0" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </span>
                          <span className="inline-flex items-center gap-1 cursor-pointer hover:text-white select-none">
                            Tokens
                            <svg className="size-3.5 stroke-current stroke-2 shrink-0" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </span>
                          <span className="inline-flex items-center gap-1 cursor-pointer hover:text-white select-none">
                            Value
                            <svg className="size-3.5 stroke-current stroke-2 shrink-0" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </span>
                          <span />
                        </div>

                        <div className="space-y-3 pt-3">
                          {!historyLoading && historyItems.length === 0 && (
                            <div className="py-8 text-center text-sm text-[#7D899A]">No transactions were returned for this pool.</div>
                          )}
                          {historyItems.map((item, idx) => {
                            const rawTypeStr = String(item.type || item.action || 'deposit').toUpperCase()
                            const isWithdrawTx =
                              rawTypeStr.includes('WITHDRAW') ||
                              rawTypeStr.includes('BURN') ||
                              rawTypeStr.includes('REMOVE') ||
                              rawTypeStr.includes('REDEEM') ||
                              rawTypeStr.includes('UNSTAKE') ||
                              rawTypeStr === 'OUT' ||
                              (typeof item.amount === 'number' && item.amount < 0)

                            const labelType = isWithdrawTx ? 'Withdraw' : 'Deposit'

                            let dateStr = 'Unknown'
                            const rawDateVal = item.timestamp || item.createdAt || item.date || item.updatedAt || item.time
                            if (rawDateVal) {
                              const d = new Date(rawDateVal as string | number | Date)
                              if (!isNaN(d.getTime())) {
                                dateStr = d.toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false,
                                })
                              } else {
                                dateStr = String(rawDateVal)
                              }
                            }

                            let assetCode = String(item.asset || item.tokenCode || item.assetCode || item.assetACode || item.currency || pool.asset).toUpperCase()
                            if (!assetCode || assetCode === 'UNDEFINED' || assetCode === 'NULL') {
                              assetCode = String(pool.asset).toUpperCase()
                            }

                            let rawAmount = 0
                            const amountKeys = ['amount', 'tokens', 'shareAmount', 'tokenAmount', 'amountA', 'amountB', 'quantity', 'shares', 'reserveA', 'reserveB', 'amount_a', 'amount_b', 'size', 'liquidity', 'volume']
                            for (const key of amountKeys) {
                              const val = item[key]
                              if (val !== undefined && val !== null && val !== '' && val !== 0 && val !== '0') {
                                const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, ''))
                                if (Number.isFinite(num) && num !== 0) {
                                  rawAmount = Math.abs(num)
                                  break
                                }
                              }
                            }
                            if (rawAmount === 0) {
                              const valNum = Number(item.value || item.usdValue || 0)
                              if (Number.isFinite(valNum) && valNum !== 0) rawAmount = Math.abs(valNum)
                            }
                            const amountDisplay = Number.isFinite(rawAmount) ? rawAmount.toFixed(2) : '0.00'

                            let valUsd = '--'
                            const rawUsd = item.usdValue ?? item.valueUsd ?? item.value ?? item.usd_value
                            if (rawUsd !== undefined && rawUsd !== null && rawUsd !== '' && rawUsd !== 0 && rawUsd !== '0' && rawUsd !== '$0.00' && rawUsd !== amountDisplay && Number(rawUsd) !== rawAmount) {
                              const parsedUsd = typeof rawUsd === 'number' ? rawUsd : parseFloat(String(rawUsd).replace(/[^0-9.-]+/g, ''))
                              if (Number.isFinite(parsedUsd) && parsedUsd > 0) {
                                valUsd = `$${parsedUsd.toFixed(2)}`
                              }
                            }

                            let txHash = String(item.hash || item.txHash || item.transactionHash || item.transaction_hash || item.tx_hash || item.txId || item.tx_id || item.xdrHash || item.signature || '')
                            if (!txHash && typeof item.id === 'string' && item.id.length >= 24 && !item.id.startsWith('demo-')) {
                              txHash = item.id
                            }

                            const explorerUrl = txHash ? `https://stellar.expert/explorer/testnet/tx/${txHash}` : null

                            return (
                              <div
                                key={item.id || `hist_${idx}`}
                                className="grid grid-cols-[minmax(160px,1.5fr)_120px_minmax(140px,1.2fr)_120px_50px] items-center gap-4 rounded-xl bg-[#141B2E]/60 border border-white/[0.06] px-4 py-3.5 transition hover:bg-[#182138]/80"
                              >
                                <span className="text-sm font-bold text-white whitespace-nowrap">{dateStr}</span>

                                <div>
                                  {labelType === 'Deposit' ? (
                                    <span className="inline-flex items-center justify-center rounded-lg bg-[#10B981]/15 px-3 py-1 text-xs font-semibold text-[#10B981]">
                                      Deposit
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center justify-center rounded-lg bg-[#EF4444]/15 px-3 py-1 text-xs font-semibold text-[#EF4444]">
                                      Withdraw
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 min-w-0">
                                  <TokenAvatar code={assetCode} size="sm" />
                                  <span className="text-sm font-bold text-white truncate">
                                    {amountDisplay} {assetCode}
                                  </span>
                                </div>

                                <span className="text-sm font-bold text-white whitespace-nowrap">{valUsd}</span>

                                <div className="flex justify-end">
                                  {explorerUrl ? (
                                    <a
                                      href={explorerUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-lg font-bold text-[#60A5FA] hover:text-white transition transform hover:scale-110 flex items-center justify-center size-8 rounded-lg hover:bg-white/[0.08]"
                                      title="View transaction on Stellar Explorer"
                                    >
                                      ↗
                                    </a>
                                  ) : (
                                    <span className="text-[#657284]">--</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Unified Deposit & Withdraw Widget Box (Matching Screenshot 1) */}
        <div className="sticky top-24 rounded-2xl border border-white/[0.10] bg-[#111119] p-6 shadow-2xl">
          {/* Action Tabs: Deposit | Withdraw */}
          <div className="mb-5 flex border-b border-white/[0.08]">
            <button
              type="button"
              onClick={() => setActionTab('deposit')}
              className={`flex-1 pb-3 text-center text-sm font-bold transition ${actionTab === 'deposit'
                  ? 'border-b-2 border-[#3B82F6] text-white'
                  : 'text-[#9CA3AF] hover:text-white'
                }`}
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setActionTab('withdraw')}
              className={`flex-1 pb-3 text-center text-sm font-bold transition ${actionTab === 'withdraw'
                  ? 'border-b-2 border-[#3B82F6] text-white'
                  : 'text-[#9CA3AF] hover:text-white'
                }`}
            >
              Withdraw
            </button>
          </div>

          {actionTab === 'deposit' && isLP && depositMode === 'single' ? (
            <>
              <DepositModeToggle mode={depositMode} onChange={setDepositMode} />
              <SingleAssetDepositPanel
                canSign={canSign}
                networkUrl={networkUrl}
                onPositionAdded={recordPosition}
                onConfirmed={() => selectPageTab('position')}
                pool={pool}
                publicKey={publicKey}
              />
            </>
          ) : actionTab === 'deposit' ? (
            <>
              {isLP && <DepositModeToggle mode={depositMode} onChange={setDepositMode} />}
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="font-medium text-[#9CA3AF]">You Deposit</span>
                <span className="font-mono text-[#9CA3AF]">--</span>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-[#161622] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <TokenAvatar code={pool.asset} size="md" />
                    <span className="font-bold text-white">{pool.asset}</span>
                  </div>
                  <input
                    className="w-40 bg-transparent text-right font-mono text-2xl font-bold text-white placeholder-white/30 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    max={available}
                    min={0}
                    onChange={(e) => setAmount(Math.min(Number(e.target.value), available))}
                    placeholder="0"
                    type="number"
                    value={amount || ''}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
                  <span className="text-[#9CA3AF]">
                    Available: <span className="font-mono text-white">{available.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span> {pool.asset}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setAmount(Number((available * 0.5).toFixed(4)))}
                      className="rounded-lg bg-white/[0.08] px-2.5 py-1 font-semibold text-white transition hover:bg-white/[0.15]"
                      type="button"
                    >
                      Half
                    </button>
                    <button
                      onClick={() => setAmount(available)}
                      className="rounded-lg bg-white/[0.08] px-2.5 py-1 font-semibold text-white transition hover:bg-white/[0.15]"
                      type="button"
                    >
                      Max
                    </button>
                  </div>
                </div>
              </div>

              {/* Slider */}
              <input
                aria-label="Deposit slider"
                className="mt-4 w-full accent-[#3B82F6]"
                max={available}
                min={0}
                onChange={(e) => setAmount(Number(e.target.value))}
                step={pool.asset === 'USDC' ? 0.01 : 1}
                type="range"
                value={amount}
              />

              {isLP && secondaryAsset && (
                <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-[#9CA3AF]">
                  <span>+ Required secondary pair: </span>
                  <strong className="text-white">
                    ~{secondaryAmount > 0 && secondaryAmount < 0.01 ? secondaryAmount.toFixed(4) : secondaryAmount.toFixed(2)} {secondaryAsset}
                  </strong>
                </div>
              )}

              {!isTestnet && isConnected && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F2C12E]/25 bg-[#F2C12E]/10 p-3 text-xs text-[#F2C12E]">
                  <span>⚠</span>
                  <span>Switch Freighter to <strong>Testnet</strong> to run transactions.</span>
                </div>
              )}

              <button
                onClick={!isConnected ? connect : handleDeposit}
                disabled={isConnected && (amount <= 0 || available <= 0 || txState === 'signing' || !canSign)}
                className={`mt-5 w-full rounded-xl py-4 text-sm font-bold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${!isConnected
                    ? 'bg-[#3B82F6] text-white hover:bg-[#2563EB] shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                    : 'bg-[#F2C12E] text-[#0D0D12] hover:bg-[#e0b429] shadow-[0_0_20px_rgba(242,193,46,0.25)]'
                  }`}
                type="button"
              >
                {!isConnected
                  ? 'Connect Wallet'
                  : txState === 'signing'
                    ? 'Waiting for Freighter…'
                    : `Deposit ${amount > 0 ? amount : ''} ${pool.asset}`}
              </button>

              {txMessage && txState === 'error' && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {txMessage}
                </div>
              )}

              {txState === 'submitted' && txHash && (
                <TransactionReceipt hash={txHash} />
              )}
            </>
          ) : (
            /* Withdraw Tab Form */
            <>
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="font-medium text-[#9CA3AF]">You Withdraw</span>
                <span className="font-mono text-[#9CA3AF]">--</span>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-[#161622] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <TokenAvatar code={pool.asset} size="md" />
                    <span className="font-bold text-white">{pool.asset}</span>
                  </div>
                  <input
                    className="w-40 bg-transparent text-right font-mono text-2xl font-bold text-white placeholder-white/30 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    max={suppliedAmount}
                    min={0}
                    onChange={(e) => setWithdrawAmount(Math.min(Number(e.target.value), suppliedAmount))}
                    placeholder="0"
                    type="number"
                    value={withdrawAmount || ''}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
                  <span className="text-[#9CA3AF]">
                    Supplied: <span className="font-mono text-white">{suppliedAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span> {pool.asset}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setWithdrawAmount(Number((suppliedAmount * 0.5).toFixed(4)))}
                      className="rounded-lg bg-white/[0.08] px-2.5 py-1 font-semibold text-white transition hover:bg-white/[0.15]"
                      type="button"
                    >
                      Half
                    </button>
                    <button
                      onClick={() => setWithdrawAmount(suppliedAmount)}
                      className="rounded-lg bg-white/[0.08] px-2.5 py-1 font-semibold text-white transition hover:bg-white/[0.15]"
                      type="button"
                    >
                      Max
                    </button>
                  </div>
                </div>
              </div>

              {/* Slider */}
              <input
                aria-label="Withdraw slider"
                className="mt-4 w-full accent-[#3B82F6]"
                max={suppliedAmount}
                min={0}
                onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                step={pool.asset === 'USDC' ? 0.01 : 1}
                type="range"
                value={withdrawAmount}
              />

              {!isTestnet && isConnected && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F2C12E]/25 bg-[#F2C12E]/10 p-3 text-xs text-[#F2C12E]">
                  <span>⚠</span>
                  <span>Switch Freighter to <strong>Testnet</strong> to run transactions.</span>
                </div>
              )}

              <button
                onClick={() => myPosition && handleWithdraw(myPosition)}
                disabled={!isConnected || withdrawAmount <= 0 || suppliedAmount <= 0 || withdrawTxState === 'signing' || !canSign}
                className={`mt-5 w-full rounded-xl py-4 text-sm font-bold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${!isConnected
                    ? 'bg-[#3B82F6] text-white hover:bg-[#2563EB] shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                    : 'bg-[#F2C12E] text-[#0D0D12] hover:bg-[#e0b429] shadow-[0_0_20px_rgba(242,193,46,0.25)]'
                  }`}
                type="button"
              >
                {!isConnected
                  ? 'Connect Wallet'
                  : withdrawTxState === 'signing'
                    ? 'Waiting for Freighter…'
                    : `Withdraw ${withdrawAmount > 0 ? withdrawAmount : ''} ${pool.asset}`}
              </button>

              {withdrawTxState === 'error' && withdrawTxMessage && (
                <p className="mt-4 break-words rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {withdrawTxMessage}
                </p>
              )}

              {withdrawTxState === 'submitted' && withdrawTxHash && (
                <div className="mt-4 rounded-xl border border-[#16A34A]/30 bg-[#16A34A]/10 p-4">
                  <div className="flex items-start gap-3">
                    <svg className="size-5 shrink-0 text-[#16A34A]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#16A34A]">Withdrawal Confirmed</p>
                      <p className="mt-0.5 text-xs text-[#9CA3AF]">Asset withdrawn to wallet.</p>
                      <a
                        className="mt-2.5 block truncate rounded-lg border border-[#16A34A]/20 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-white hover:border-[#16A34A]/40"
                        href={`https://stellar.expert/explorer/testnet/tx/${withdrawTxHash}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {withdrawTxHash}
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
