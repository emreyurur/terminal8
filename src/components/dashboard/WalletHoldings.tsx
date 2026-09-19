import { formatCurrency, truncatePublicKey } from '../../lib/format'
import type { WalletBalance } from '../../types/stellar'

type Props = {
  balances: WalletBalance[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  onOpenRamp: () => void
}

const amountFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 7 })

/** Home card: what the connected wallet actually holds (live from Horizon). */
export function WalletHoldings({ balances, loading, error, onRefresh, onOpenRamp }: Props) {
  const held = balances.filter((b) => Number(b.balance) > 0)
  // USDC is pegged to $1, so it is the only asset we can value in dollars without a price feed.
  const usdc = held.filter((b) => b.code === 'USDC').reduce((sum, b) => sum + Number(b.balance), 0)
  const label = (b: WalletBalance) => (b.poolId ? 'LP shares' : b.code)
  const codeCount = (code: string) => held.filter((b) => b.code === code).length

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#12121A] p-5 text-[#F0F0F0]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#9CA3AF]">Your assets · Testnet</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{formatCurrency(usdc)}</p>
          <p className="mt-0.5 text-xs text-[#9CA3AF]">USDC balance (1 USDC = $1)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-xl bg-[#F2C12E] px-3 py-2 text-xs font-semibold text-[#0A0A0E] transition hover:bg-[#F2C12E]/90"
            onClick={onOpenRamp}
            type="button"
          >
            Buy / Sell USDC
          </button>
          <button
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-[#9CA3AF] transition hover:border-[#F2C12E] hover:text-[#F2C12E] disabled:opacity-50"
            disabled={loading}
            onClick={onRefresh}
            type="button"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">Could not load balances: {error}</p>}

      {held.length === 0 && !error ? (
        <p className="mt-4 text-sm text-[#9CA3AF]">
          {loading ? 'Loading balances…' : 'No assets yet. Fund the account or use Buy / Sell USDC.'}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-white/[0.06]">
          {held.map((b) => (
            <li className="flex items-center justify-between gap-4 py-2 text-sm" key={b.id}>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{label(b)}</span>
                {b.poolId && (
                  <span className="font-mono text-[10px] text-[#9CA3AF]" title={b.poolId}>
                    {truncatePublicKey(b.poolId)}
                  </span>
                )}
                {!b.isNative && !b.poolId && codeCount(b.code) > 1 && (
                  <span className="font-mono text-[10px] text-[#9CA3AF]">{truncatePublicKey(b.issuer)}</span>
                )}
              </span>
              <span className="tabular-nums">{amountFormat.format(Number(b.balance))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
