import { useMemo, useState } from 'react'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { useSingleAssetSides } from '../../hooks/useSingleAssetSides'
import { positionAmountFromPlan } from '../../lib/singleAsset'
import {
  previewSingleAssetDeposit,
  submitSingleAssetDeposit,
  type SingleAssetBuild,
} from '../../services/singleAssetDeposit'
import type { FreighterSignFn } from '../../services/terminal8Api'
import type { DeFiPool, LocalPosition } from '../../types/stellar'

const SLIPPAGE_OPTIONS = [50, 100, 200] as const

const sign: FreighterSignFn = (xdr, opts) =>
  StellarWalletsKit.signTransaction(xdr, { networkPassphrase: opts.networkPassphrase, address: opts.accountToSign })

const fmt = (n: number, max = 4) => n.toLocaleString(undefined, { maximumFractionDigits: max })
const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return String(e)
}

type Props = {
  pool: DeFiPool
  publicKey: string | null
  networkUrl: string | null
  canSign: boolean
  onPositionAdded: (pos: Omit<LocalPosition, 'id'>) => void
}

/**
 * Deposit with only one of the pool's assets: the backend works out how much to swap, and one
 * transaction (trustlines, swap, deposit) is signed once.
 */
export function SingleAssetDepositPanel({ pool, publicKey, networkUrl, canSign, onPositionAdded }: Props) {
  const { sides, loading, error, refresh } = useSingleAssetSides(pool.id, publicKey, networkUrl)

  const [sourceKey, setSourceKey] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState<number>(50)
  const [built, setBuilt] = useState<SingleAssetBuild | null>(null)
  const [busy, setBusy] = useState<'preview' | 'sign' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Until the user picks a side, default to the one the wallet holds most of.
  const source = useMemo(() => {
    if (sourceKey) return sides.find((s) => s.key === sourceKey) ?? null
    const best = sides.slice().sort((a, b) => b.usable - a.usable)[0]
    return best && best.usable > 0 ? best : null
  }, [sides, sourceKey])
  const amountNum = Number(amount)
  const validAmount = Number.isFinite(amountNum) && amountNum > 0 && (!source || amountNum <= source.usable)

  // Any edit invalidates the prepared transaction (it was built for the old numbers).
  const resetPlan = () => {
    setBuilt(null)
    setMessage(null)
    setTxHash(null)
  }

  const preview = async () => {
    if (!publicKey || !source) return
    setBusy('preview')
    resetPlan()
    try {
      const sourceAsset = sides.filter((s) => s.code === source.code).length > 1 ? source.key : source.code
      setBuilt(await previewSingleAssetDeposit(publicKey, sign, { poolId: pool.id, sourceAsset, amount: amountNum, slippageBps }))
    } catch (e) {
      setMessage(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const confirm = async () => {
    if (!publicKey || !built) return
    setBusy('sign')
    setMessage(null)
    try {
      const { hash } = await submitSingleAssetDeposit(publicKey, sign, built, pool.id)
      setTxHash(hash)
      onPositionAdded({
        amount: positionAmountFromPlan(built.plan, pool.asset),
        asset: pool.asset || 'XLM',
        hash,
        protocol: pool.protocol || 'Soroswap AMM',
        status: 'SUCCESS',
        timestamp: new Date().toLocaleTimeString(),
        openedAt: Date.now(),
        apy: Number.isFinite(Number(pool.apy)) ? Number(pool.apy) : 5,
        category: pool.category || 'AMM LP',
        poolId: pool.id,
      })
      setBuilt(null)
      setAmount('')
      refresh()
    } catch (e) {
      setMessage(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const plan = built?.plan
  const impactClass =
    !plan || plan.priceImpactPct < 2 ? 'text-[#9CA3AF]' : plan.priceImpactPct < 5 ? 'text-[#F2C12E]' : 'text-red-400'

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-[#9CA3AF]">
        Hold only one of the pool&apos;s assets? We swap the right part and deposit both sides in a single transaction, with
        one signature.
      </p>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        {sides.map((s) => (
          <button
            className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
              s.key === source?.key ? 'border-[#F2C12E] bg-[#F2C12E]/10' : 'border-white/[0.08] bg-[#161622] hover:border-white/20'
            }`}
            disabled={s.usable <= 0 || busy !== null}
            key={s.key}
            onClick={() => {
              setSourceKey(s.key)
              resetPlan()
            }}
            type="button"
          >
            <p className="text-sm font-bold text-white">{s.code}</p>
            <p className="mt-0.5 font-mono text-[11px] text-[#9CA3AF]">{fmt(s.usable)} usable</p>
          </button>
        ))}
        {loading && sides.length === 0 && <p className="col-span-2 text-xs text-[#9CA3AF]">Loading balances…</p>}
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-[#161622] p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="font-bold text-white">{source?.code ?? 'Amount'}</span>
          <input
            className="w-40 bg-transparent text-right font-mono text-2xl font-bold text-white placeholder-white/30 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            disabled={!source || busy !== null}
            min={0}
            onChange={(e) => {
              setAmount(e.target.value)
              resetPlan()
            }}
            placeholder="0"
            type="number"
            value={amount}
          />
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[#9CA3AF]">Slippage</span>
            {SLIPPAGE_OPTIONS.map((bps) => (
              <button
                className={`rounded-lg px-2 py-1 font-semibold transition ${
                  slippageBps === bps ? 'bg-[#F2C12E] text-[#0D0D12]' : 'bg-white/[0.08] text-white hover:bg-white/[0.15]'
                }`}
                key={bps}
                onClick={() => {
                  setSlippageBps(bps)
                  resetPlan()
                }}
                type="button"
              >
                {bps / 100}%
              </button>
            ))}
          </div>
          <button
            className="rounded-lg bg-white/[0.08] px-2.5 py-1 font-semibold text-white transition hover:bg-white/[0.15] disabled:opacity-40"
            disabled={!source || busy !== null}
            onClick={() => {
              if (!source) return
              setAmount(String(Math.floor(source.usable * 1e4) / 1e4))
              resetPlan()
            }}
            type="button"
          >
            Max
          </button>
        </div>
      </div>

      {source && Number(amount) > source.usable && (
        <p className="text-xs text-red-300">
          Only {fmt(source.usable)} {source.code} can be used (the rest is reserved for account reserves and fees).
        </p>
      )}

      {plan && (
        <div className="space-y-2 rounded-xl border border-[#F2C12E]/25 bg-[#F2C12E]/[0.06] p-4 text-xs">
          <p className="font-semibold text-white">What will happen</p>
          <Row label="1. Swap" value={`${fmt(plan.swapAmount)} ${plan.sourceAsset} → ${fmt(plan.receiveAmount)} ${plan.destAsset}`} />
          <Row label="2. Deposit" value={`${fmt(plan.expectedDepositSource)} ${plan.sourceAsset} + ${fmt(plan.expectedDepositDest)} ${plan.destAsset}`} />
          <Row label="Price impact" value={`${plan.priceImpactPct.toFixed(2)}%`} valueClass={impactClass} />
          <Row label="Stays in your wallet" value={`≈ ${fmt(plan.estimatedLeftoverSource)} ${plan.sourceAsset}`} />
          {plan.addsTrustlines.length > 0 && <Row label="Also adds" value={`${plan.addsTrustlines.join(' + ')} trustline`} />}
          {plan.priceImpactPct >= 5 && (
            <p className="pt-1 text-red-300">High price impact: the swap moves this pool a lot. Consider a smaller amount.</p>
          )}
        </div>
      )}

      {message && <p className="break-words rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{message}</p>}

      {txHash && (
        <div className="rounded-xl border border-[#16A34A]/30 bg-[#16A34A]/10 p-4 text-xs">
          <p className="font-semibold text-[#16A34A]">Deposit confirmed</p>
          <a
            className="mt-2 block truncate rounded-lg border border-[#16A34A]/20 bg-white/[0.04] px-3 py-1.5 font-mono text-white hover:border-[#16A34A]/40"
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            rel="noreferrer"
            target="_blank"
          >
            {txHash}
          </a>
        </div>
      )}

      {!plan ? (
        <button
          className="w-full rounded-xl bg-[#F2C12E] py-4 text-sm font-bold text-[#0D0D12] transition hover:bg-[#e0b429] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canSign || !source || !validAmount || busy !== null}
          onClick={preview}
          type="button"
        >
          {busy === 'preview' ? 'Calculating…' : 'Preview single-asset deposit'}
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            className="rounded-xl border border-white/10 px-4 py-4 text-sm font-semibold text-[#9CA3AF] transition hover:border-white/25 hover:text-white disabled:opacity-40"
            disabled={busy !== null}
            onClick={resetPlan}
            type="button"
          >
            Edit
          </button>
          <button
            className="flex-1 rounded-xl bg-[#F2C12E] py-4 text-sm font-bold text-[#0D0D12] transition hover:bg-[#e0b429] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canSign || busy !== null}
            onClick={confirm}
            type="button"
          >
            {busy === 'sign' ? 'Waiting for wallet…' : 'Confirm & sign'}
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, valueClass = 'text-white' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[#9CA3AF]">{label}</span>
      <span className={`text-right font-mono ${valueClass}`}>{value}</span>
    </div>
  )
}
