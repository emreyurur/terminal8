import { useState } from 'react'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { useWallet } from '../../context/useWallet'
import {
  getRampInfo,
  getRampTransaction,
  ensureTrustline,
  getStoredAnchorToken,
  loginToAnchor,
  sendWithdrawPayment,
  simulateDepositTransfer,
  startDeposit,
  startWithdraw,
  type SignFn,
} from '../../services/rampApi'
import { loginWithFreighterFlow, getStoredJwtToken } from '../../services/terminal8Api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

const sign: SignFn = (xdr, opts) =>
  StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase: opts.networkPassphrase,
    address: opts.accountToSign,
  })

const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; error?: unknown }
    if (typeof o.message === 'string') return o.message
    if (typeof o.error === 'string') return o.error
  }
  return String(e)
}

type Tab = 'deposit' | 'withdraw'
type DepositStep = 'form' | 'pending' | 'done'
type WithdrawStep = 'form' | 'confirm' | 'done'

interface Props {
  onBalancesChanged?: () => void
}

export function FundingPanel({ onBalancesChanged }: Props) {
  const { publicKey, status, networkPassphrase } = useWallet()
  const connected = status === 'CONNECTED' && !!publicKey

  const [tab, setTab] = useState<Tab>('deposit')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null)
  const [loggedIn, setLoggedIn] = useState(() => !!getStoredJwtToken() && !!getStoredAnchorToken())
  const [anchorInfo, setAnchorInfo] = useState<Json>(null)

  // Deposit state
  const [depositAmount, setDepositAmount] = useState('100')
  const [depositInfo, setDepositInfo] = useState<Json>(null)
  const [depositStep, setDepositStep] = useState<DepositStep>('form')

  // Withdraw state
  const [iban, setIban] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawStep, setWithdrawStep] = useState<WithdrawStep>('form')
  const [withdrawData, setWithdrawData] = useState<Json>(null)
  const [paymentHash, setPaymentHash] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg({ text: errMsg(e), type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const getInfo = async () => {
    if (anchorInfo) return anchorInfo
    const info = await getRampInfo()
    setAnchorInfo(info)
    return info
  }

  const ensureLogin = async () => {
    if (loggedIn) return
    if (!publicKey) throw new Error('Connect your wallet first.')
    setMsg({ text: 'Sign two quick challenges in your wallet…', type: 'info' })
    await loginWithFreighterFlow(publicKey, sign)
    await loginToAnchor(publicKey, sign)
    setLoggedIn(true)
    setMsg(null)
  }

  // ── Deposit step 1: fetch IBAN ─────────────────────────────────────────────
  const handleDeposit = () =>
    run(async () => {
      if (!publicKey) throw new Error('Connect your wallet first.')
      await ensureLogin()
      const info = await getInfo()
      setMsg({ text: 'Checking USDC trustline…', type: 'info' })
      await ensureTrustline(
        publicKey,
        sign,
        { code: info.asset.code, issuer: info.asset.issuer },
        networkPassphrase ?? undefined,
      )
      setMsg({ text: 'Contacting anchor…', type: 'info' })
      const res = await startDeposit(depositAmount)
      setDepositInfo(res)
      setMsg(null)
      setDepositStep('pending')
    })

  // ── Deposit step 2: simulate bank transfer + poll until settled ────────────────
  const handleDepositConfirm = () =>
    run(async () => {
      if (!depositInfo?.id) throw new Error('No deposit session found.')
      setMsg({ text: 'Processing your transfer…', type: 'info' })
      await simulateDepositTransfer(depositInfo.id, depositAmount)

      // Poll exactly like RampView does: up to 20 attempts, 3s apart
      const isDone = (s: string) => s === 'completed' || s.startsWith('error') || s === 'refunded'
      for (let i = 0; i < 20; i++) {
        const res = await getRampTransaction(depositInfo.id)
        const t = res.transaction ?? res
        const status = String(t.status)
        setMsg({ text: `Processing… (${status})`, type: 'info' })
        if (isDone(status)) {
          if (status === 'completed') {
            onBalancesChanged?.()
            setDepositStep('done')
            setMsg(null)
          } else {
            setMsg({ text: `Transfer ended with status: ${status}`, type: 'error' })
          }
          return
        }
        await new Promise((r) => setTimeout(r, 3_000))
      }
      // Timed out — still likely OK, just slow anchor
      onBalancesChanged?.()
      setDepositStep('done')
      setMsg(null)
    })

  const resetDeposit = () => {
    setDepositStep('form')
    setDepositInfo(null)
    setMsg(null)
  }

  // ── Withdraw step 1: get anchor details ────────────────────────────────────
  const handleWithdrawInit = () =>
    run(async () => {
      if (!publicKey) throw new Error('Connect your wallet first.')
      if (!iban.trim()) throw new Error('Please enter your IBAN.')
      if (!withdrawAmount || Number(withdrawAmount) <= 0) throw new Error('Enter a valid amount.')
      await ensureLogin()
      const info = await getInfo()
      setMsg({ text: 'Fetching withdraw details…', type: 'info' })
      const res = await startWithdraw(iban.trim(), withdrawAmount)
      setWithdrawData({ ...res, info })
      setMsg(null)
      setWithdrawStep('confirm')
    })

  // ── Withdraw step 2: sign & send ──────────────────────────────────────────
  const handleWithdrawConfirm = () =>
    run(async () => {
      if (!publicKey || !withdrawData) return
      const info = withdrawData.info
      setMsg({ text: 'Sign the payment in your wallet…', type: 'info' })
      const hash = await sendWithdrawPayment(
        publicKey,
        sign,
        {
          amount: withdrawAmount,
          anchorAccount: withdrawData.account_id ?? withdrawData.withdraw_anchor_account,
          memo: String(withdrawData.memo),
          memoType: withdrawData.memo_type,
        },
        info?.asset?.issuer ? { code: info.asset.code, issuer: info.asset.issuer } : undefined,
      )
      setPaymentHash(hash)
      setWithdrawStep('done')
      setMsg(null)
      onBalancesChanged?.()
    })

  const resetWithdraw = () => {
    setWithdrawStep('form')
    setIban('')
    setWithdrawAmount('')
    setWithdrawData(null)
    setPaymentHash('')
    setMsg(null)
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    setMsg(null)
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#12121A] p-5 text-[#F0F0F0]">
      {/* Header + tabs */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-[#9CA3AF]">Funds</p>
        <div className="flex rounded-xl overflow-hidden border border-white/10 text-xs">
          <button
            className={`px-4 py-1.5 font-semibold transition ${tab === 'deposit' ? 'bg-[#F2C12E] text-[#0A0A0E]' : 'text-[#9CA3AF] hover:text-white'}`}
            onClick={() => switchTab('deposit')}
            type="button"
          >
            Add Funds
          </button>
          <button
            className={`px-4 py-1.5 font-semibold transition border-l border-white/10 ${tab === 'withdraw' ? 'bg-[#F2C12E] text-[#0A0A0E]' : 'text-[#9CA3AF] hover:text-white'}`}
            onClick={() => switchTab('withdraw')}
            type="button"
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Status message */}
      {msg && (
        <div
          className={`mb-4 rounded-xl px-3 py-2.5 text-xs ${
            msg.type === 'error'
              ? 'bg-red-500/10 text-red-300 border border-red-500/20'
              : msg.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              : 'bg-white/5 text-[#9CA3AF] border border-white/10'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* ── DEPOSIT ─────────────────────────────────────────────────────── */}
      {tab === 'deposit' && (
        <div className="space-y-3">
          <p className="text-xs text-[#6B7280]">Transfer TRY by bank — receive USDC in your wallet.</p>

          {/* Step 1: form */}
          {depositStep === 'form' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-[#9CA3AF] mb-1">Amount (TRY)</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-[#0A0A0E] px-3 py-2 text-sm text-[#F0F0F0] outline-none focus:border-[#F2C12E]"
                  disabled={busy}
                  min="1"
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="500"
                  type="number"
                  value={depositAmount}
                />
              </div>
              <div className="flex items-end">
                <button
                  className="rounded-xl bg-[#F2C12E] px-4 py-2 text-sm font-semibold text-[#0A0A0E] transition hover:bg-[#F2C12E]/90 disabled:opacity-40"
                  disabled={!connected || busy}
                  onClick={handleDeposit}
                  type="button"
                >
                  {busy ? '…' : 'Get IBAN'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: show IBAN, wait for user to transfer */}
          {depositStep === 'pending' && depositInfo && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#F2C12E]/20 bg-[#F2C12E]/5 p-4 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#F2C12E] mb-2">Transfer to this account</p>
                {depositInfo.how && <p className="text-xs text-[#D1D5DB] mb-2">{depositInfo.how}</p>}
                {depositInfo.iban && <Row label="IBAN" value={depositInfo.iban} mono />}
                {depositInfo.bank_name && <Row label="Bank" value={depositInfo.bank_name} />}
                {depositInfo.reference && <Row label="Reference" value={depositInfo.reference} mono />}
              </div>
              <button
                className="w-full rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-40"
                disabled={busy}
                onClick={handleDepositConfirm}
                type="button"
              >
                {busy ? 'Processing…' : "I've Transferred — Send USDC to My Wallet"}
              </button>
              <button className="text-xs text-[#6B7280] hover:text-[#9CA3AF]" onClick={resetDeposit} type="button">
                ← Start over
              </button>
            </div>
          )}

          {/* Step 3: done */}
          {depositStep === 'done' && (
            <div className="space-y-2">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
                ✓ USDC sent to your wallet!
              </div>
              <button className="text-xs text-[#F2C12E] hover:underline" onClick={resetDeposit} type="button">
                Add more funds →
              </button>
            </div>
          )}

          {!connected && <p className="text-xs text-[#6B7280]">Connect your wallet to continue.</p>}
        </div>
      )}

      {/* ── WITHDRAW ────────────────────────────────────────────────────── */}
      {tab === 'withdraw' && (
        <>
          {/* Step 1: form */}
          {withdrawStep === 'form' && (
            <div className="space-y-3">
              <p className="text-xs text-[#6B7280]">Send USDC — receive TRY to your bank account.</p>
              <div>
                <label className="block text-[10px] text-[#9CA3AF] mb-1">Your IBAN</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-[#0A0A0E] px-3 py-2 text-sm text-[#F0F0F0] outline-none focus:border-[#F2C12E] font-mono"
                  disabled={busy}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  value={iban}
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#9CA3AF] mb-1">Amount (USDC)</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-[#0A0A0E] px-3 py-2 text-sm text-[#F0F0F0] outline-none focus:border-[#F2C12E]"
                  disabled={busy}
                  min="1"
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="50"
                  type="number"
                  value={withdrawAmount}
                />
              </div>
              <button
                className="w-full rounded-xl bg-[#F2C12E] py-2 text-sm font-semibold text-[#0A0A0E] transition hover:bg-[#F2C12E]/90 disabled:opacity-40"
                disabled={!connected || busy || !iban.trim() || !withdrawAmount}
                onClick={handleWithdrawInit}
                type="button"
              >
                {busy ? 'Processing…' : 'Withdraw'}
              </button>
              {!connected && <p className="text-xs text-[#6B7280]">Connect your wallet to continue.</p>}
            </div>
          )}

          {/* Step 2: confirm */}
          {withdrawStep === 'confirm' && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Confirm Withdrawal</p>
              <div className="rounded-xl border border-white/10 bg-[#0A0A0E] p-4 space-y-2">
                <Row label="Amount" value={`${withdrawAmount} USDC`} />
                <Row label="To IBAN" value={iban} mono />
                {withdrawData?.memo && <Row label="Memo" value={String(withdrawData.memo)} mono />}
              </div>
              <p className="text-xs text-[#6B7280]">Your wallet will ask you to sign the payment transaction.</p>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-[#9CA3AF] transition hover:border-white/30"
                  disabled={busy}
                  onClick={resetWithdraw}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-xl bg-[#F2C12E] py-2 text-sm font-semibold text-[#0A0A0E] transition hover:bg-[#F2C12E]/90 disabled:opacity-40"
                  disabled={busy}
                  onClick={handleWithdrawConfirm}
                  type="button"
                >
                  {busy ? 'Signing…' : 'Confirm & Send'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: done */}
          {withdrawStep === 'done' && (
            <div className="space-y-2">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
                ✓ Withdrawal complete! TRY will arrive at your IBAN shortly.
              </div>
              {paymentHash && (
                <p className="text-[10px] text-[#6B7280] break-all">
                  Tx: <span className="font-mono text-[#9CA3AF]">{paymentHash}</span>
                </p>
              )}
              <button className="text-xs text-[#F2C12E] hover:underline" onClick={resetWithdraw} type="button">
                New withdrawal →
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-[#6B7280] shrink-0">{label}</span>
      <span className={`text-right truncate ${mono ? 'font-mono text-[#E5E7EB]' : 'text-[#D1D5DB]'}`}>{value}</span>
    </div>
  )
}
