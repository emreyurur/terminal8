import { useEffect, useState } from 'react'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { useWallet } from '../../context/useWallet'
import { loginWithFreighterFlow, getStoredJwtToken } from '../../services/terminal8Api'
import {
  getQuote,
  getRampInfo,
  ensureTrustline,
  getRampTransaction,
  getStoredAnchorToken,
  loginToAnchor,
  sendWithdrawPayment,
  simulateDepositTransfer,
  setStoredAnchorToken,
  startDeposit,
  startWithdraw,
  type SignFn,
} from '../../services/rampApi'

const card = 'rounded-2xl border border-white/10 bg-[#12121A] p-6 shadow-xl'
const input = 'w-full rounded-xl border border-white/10 bg-[#0A0A0E] px-3 py-2 text-sm text-[#F0F0F0] outline-none focus:border-[#F2C12E]'
const button =
  'rounded-xl bg-[#F2C12E] px-4 py-2 text-sm font-semibold text-[#0A0A0E] transition hover:bg-[#F2C12E]/90 disabled:opacity-50'
const pre = 'mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0A0A0E] p-4 font-mono text-xs text-[#E5E7EB]'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any
const show = (v: unknown) => JSON.stringify(v, null, 2)
// Wallet kits often throw plain objects ({ code, message }) instead of Error instances.
const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; error?: unknown }
    if (typeof o.message === 'string') return o.message
    if (typeof o.error === 'string') return o.error
    try {
      return JSON.stringify(e)
    } catch {
      /* fall through */
    }
  }
  return String(e)
}

const sign: SignFn = (xdr, opts) =>
  StellarWalletsKit.signTransaction(xdr, { networkPassphrase: opts.networkPassphrase, address: opts.accountToSign })

export function RampView({ onBalancesChanged }: { onBalancesChanged?: () => void } = {}) {
  const { publicKey, status, networkPassphrase } = useWallet()
  const connected = status === 'CONNECTED' && !!publicKey

  const [info, setInfo] = useState<Json>(null)
  const [loggedIn, setLoggedIn] = useState(() => !!getStoredJwtToken() && !!getStoredAnchorToken())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  const [quoteAmount, setQuoteAmount] = useState('500')
  const [quote, setQuote] = useState<Json>(null)

  const [depositAmount, setDepositAmount] = useState('100')
  const [deposit, setDeposit] = useState<Json>(null)

  const [iban, setIban] = useState('TR330006100519786457841326')
  const [withdrawAmount, setWithdrawAmount] = useState('10')
  const [withdraw, setWithdraw] = useState<Json>(null)
  const [paymentHash, setPaymentHash] = useState('')

  const [txId, setTxId] = useState('')
  const [tx, setTx] = useState<Json>(null)

  useEffect(() => {
    getRampInfo().then(setInfo).catch((e) => setMsg(`Info failed: ${errMsg(e)}`))
  }, [])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setMsg('')
    try {
      await fn()
    } catch (e) {
      console.error(`[ramp] ${label} failed`, e)
      setMsg(`${label} failed: ${errMsg(e)}`)
    } finally {
      setBusy('')
    }
  }

  const login = () =>
    run('Login', async () => {
      if (!publicKey) throw new Error('Connect wallet first')
      setMsg('Step 1/2: sign the Terminal8 challenge in your wallet...')
      try {
        await loginWithFreighterFlow(publicKey, sign)
      } catch (e) {
        throw new Error(`Terminal8 login (step 1/2): ${errMsg(e)}`, { cause: e })
      }
      setMsg('Step 2/2: sign the anchor challenge in your wallet...')
      try {
        await loginToAnchor(publicKey, sign)
      } catch (e) {
        throw new Error(`Anchor login (step 2/2): ${errMsg(e)}`, { cause: e })
      }
      setLoggedIn(true)
      setMsg('Logged in to Terminal8 and the anchor.')
    })

  const logout = () => {
    setStoredAnchorToken(null)
    try {
      localStorage.removeItem('terminal8_jwt_token')
    } catch {
      /* ignore */
    }
    setLoggedIn(false)
  }

  const issuer = info?.asset?.issuer as string | undefined

  const doQuote = () =>
    run('Quote', async () => {
      if (!issuer) throw new Error('USDC issuer unknown')
      setQuote(await getQuote('iso4217:TRY', `stellar:USDC:${issuer}`, quoteAmount))
    })

  const doDeposit = () =>
    run('Deposit', async () => {
      if (!publicKey || !info?.asset?.issuer) throw new Error('Wallet or anchor info missing')
      setMsg('Checking USDC trustline...')
      const added = await ensureTrustline(
        publicKey,
        sign,
        { code: info.asset.code, issuer: info.asset.issuer },
        networkPassphrase ?? undefined,
      )
      setMsg(added ? 'USDC trustline added.' : '')
      const res = await startDeposit(depositAmount)
      setDeposit(res)
      if (res.id) setTxId(res.id)
    })

  const isDone = (status: string) => status === 'completed' || status.startsWith('error') || status === 'refunded'

  // Sandbox: mark the TRY transfer as received on the anchor, then follow the deposit until it settles.
  const doSimulate = () =>
    run('Simulate transfer', async () => {
      if (!deposit?.id) throw new Error('Start a deposit first')
      await simulateDepositTransfer(deposit.id, depositAmount)
      setTxId(deposit.id)
      for (let i = 0; i < 20; i++) {
        const res = await getRampTransaction(deposit.id)
        const t = res.transaction ?? res
        setTx(t)
        setMsg(`Deposit status: ${t.status}`)
        if (isDone(String(t.status))) {
          if (t.status === 'completed') {
            setMsg('Deposit completed. USDC is in your wallet.')
            onBalancesChanged?.()
          }
          return
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
      setMsg('Still processing. Use Refresh in the status section.')
    })

  const doWithdraw = () =>
    run('Withdraw', async () => {
      const res = await startWithdraw(iban, withdrawAmount)
      setWithdraw(res)
      setPaymentHash('')
      if (res.id) setTxId(res.id)
    })

  const doPay = () =>
    run('Payment', async () => {
      if (!publicKey || !withdraw) return
      const anchorAccount = withdraw.account_id ?? withdraw.withdraw_anchor_account
      const hash = await sendWithdrawPayment(
        publicKey,
        sign,
        {
          amount: withdrawAmount,
          anchorAccount,
          memo: String(withdraw.memo),
          memoType: withdraw.memo_type,
        },
        info?.asset?.issuer ? { code: info.asset.code, issuer: info.asset.issuer } : undefined,
      )
      setPaymentHash(hash)
      onBalancesChanged?.()
    })

  const doTrack = () =>
    run('Status', async () => {
      const res = await getRampTransaction(txId)
      setTx(res.transaction ?? res)
    })

  const disabled = !connected || !loggedIn || !!busy

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-[#F0F0F0]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#F2C12E]">TRY ⇄ USDC Ramp</h1>
        <p className="text-sm text-[#9CA3AF]">
          Testnet only. The bank is simulated by the anchor; the USDC leg is real testnet USDC. The USDC trustline is
          added automatically (one extra signature) if your wallet does not have it yet.
        </p>
      </div>

      {msg && <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm break-words">{msg}</div>}

      <div className={card}>
        <h2 className="text-lg font-semibold">1. Anchor & login</h2>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          {info ? `${info.homeDomain} · ${info.asset.code} · issuer ${info.asset.issuer?.slice(0, 8)}…` : 'Loading anchor info…'}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={button} disabled={!connected || !!busy} onClick={login} type="button">
            {loggedIn ? 'Re-login' : 'Login (Terminal8 + Anchor)'}
          </button>
          {loggedIn && (
            <button className="rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-300" onClick={logout} type="button">
              Clear tokens
            </button>
          )}
          <span className="text-sm text-[#9CA3AF]">
            {!connected ? 'Connect your wallet in the header first.' : loggedIn ? 'Logged in ✓' : 'Two signatures required.'}
          </span>
        </div>
      </div>

      <div className={card}>
        <h2 className="text-lg font-semibold">2. Quote (TRY → USDC)</h2>
        <div className="mt-3 flex gap-3">
          <input className={input} value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)} placeholder="TRY amount" />
          <button className={button} disabled={disabled} onClick={doQuote} type="button">Get price</button>
        </div>
        {quote && <pre className={pre}>{show(quote)}</pre>}
      </div>

      <div className={card}>
        <h2 className="text-lg font-semibold">3. On-ramp: deposit TRY</h2>
        <p className="mt-1 text-sm text-[#9CA3AF]">Returns an IBAN and a reference to write in the transfer description.</p>
        <div className="mt-3 flex gap-3">
          <input className={input} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="Amount" />
          <button className={button} disabled={disabled} onClick={doDeposit} type="button">Start deposit</button>
        </div>
        {deposit && (
          <>
            {deposit.how && (
              <p className="mt-3 text-sm text-[#E5E7EB]">{deposit.how}</p>
            )}
            <button className={`${button} mt-3`} disabled={disabled} onClick={doSimulate} type="button">
              Simulate incoming TRY transfer (sandbox)
            </button>
            <pre className={pre}>{show(deposit)}</pre>
          </>
        )}
      </div>

      <div className={card}>
        <h2 className="text-lg font-semibold">4. Off-ramp: withdraw to IBAN</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <input className={input} value={iban} onChange={(e) => setIban(e.target.value)} placeholder="Destination IBAN" />
          <input className={input} value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="USDC amount" />
          <button className={button} disabled={disabled} onClick={doWithdraw} type="button">Start withdraw</button>
        </div>
        {withdraw && (
          <>
            <pre className={pre}>{show(withdraw)}</pre>
            <button className={`${button} mt-3`} disabled={disabled} onClick={doPay} type="button">
              Send {withdrawAmount} USDC (sign in wallet)
            </button>
            {paymentHash && <p className="mt-2 break-all text-sm text-emerald-400">Payment tx: {paymentHash}</p>}
          </>
        )}
      </div>

      <div className={card}>
        <h2 className="text-lg font-semibold">5. Transaction status</h2>
        <div className="mt-3 flex gap-3">
          <input className={input} value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="Transaction id" />
          <button className={button} disabled={disabled || !txId} onClick={doTrack} type="button">Refresh</button>
        </div>
        {tx && <pre className={pre}>{show(tx)}</pre>}
      </div>
    </div>
  )
}
