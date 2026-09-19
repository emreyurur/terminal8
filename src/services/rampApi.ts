import { Account, Asset, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { API_BASE, HORIZON_URL, getStoredJwtToken, submitToHorizon } from './terminal8Api'

const ANCHOR_TOKEN_KEY = 'terminal8_anchor_token'

export function getStoredAnchorToken(): string | null {
  try {
    return sessionStorage.getItem(ANCHOR_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredAnchorToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(ANCHOR_TOKEN_KEY, token)
    else sessionStorage.removeItem(ANCHOR_TOKEN_KEY)
  } catch {
    /* ignore storage errors */
  }
}

export type SignFn = (
  xdr: string,
  opts: { networkPassphrase: string; accountToSign?: string },
) => Promise<string | { signedTxXdr: string }>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

async function request(path: string, init: RequestInit & { anchor?: boolean; auth?: boolean } = {}): Promise<Json> {
  const { anchor, auth, ...rest } = init
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    const jwt = getStoredJwtToken()
    if (!jwt) throw new Error('Terminal8 JWT missing. Log in first.')
    headers.Authorization = `Bearer ${jwt}`
  }
  if (anchor) {
    const token = getStoredAnchorToken()
    if (!token) throw new Error('Anchor token missing. Log in first.')
    headers['x-anchor-token'] = token
  }
  const res = await fetch(`${API_BASE}api/v1/ramp/${path}`, { ...rest, headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function signToString(sign: SignFn, xdr: string, networkPassphrase: string, account: string) {
  const res = await sign(xdr, { networkPassphrase, accountToSign: account })
  const signed = typeof res === 'string' ? res : res.signedTxXdr
  if (!signed) {
    const reason = (res as { error?: { message?: string } | string }).error
    const detail = typeof reason === 'string' ? reason : reason?.message
    throw new Error(`Wallet did not sign the transaction${detail ? `: ${detail}` : ' (rejected or site not authorized)'}`)
  }
  return signed
}

export const getRampInfo = () => request('info')

/** Anchor SEP-10: challenge -> sign -> token (kept separate from the Terminal8 JWT). */
export async function loginToAnchor(publicKey: string, sign: SignFn): Promise<string> {
  const challenge = await request(`auth/challenge?publicKey=${encodeURIComponent(publicKey)}`)
  const signed = await signToString(sign, challenge.transaction, challenge.network_passphrase, publicKey)
  const { token } = await request('auth/token', {
    method: 'POST',
    body: JSON.stringify({ transaction: signed }),
  })
  setStoredAnchorToken(token)
  return token
}

export const getQuote = (sellAsset: string, buyAsset: string, sellAmount: string) =>
  request(
    `quote?sellAsset=${encodeURIComponent(sellAsset)}&buyAsset=${encodeURIComponent(buyAsset)}&sellAmount=${encodeURIComponent(sellAmount)}`,
    { anchor: true },
  )

export const startDeposit = (amount?: string) =>
  request('deposit', { method: 'POST', anchor: true, auth: true, body: JSON.stringify({ amount: amount || undefined }) })

/** Sandbox only: tells the mock anchor the TRY bank transfer arrived (done server-side, no redirect). */
export const simulateDepositTransfer = (id: string, amount?: string) =>
  request(`deposit/${encodeURIComponent(id)}/simulate-transfer`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ amount: amount || undefined }),
  })

export const startWithdraw = (dest: string, amount?: string) =>
  request('withdraw', { method: 'POST', anchor: true, auth: true, body: JSON.stringify({ dest, amount: amount || undefined }) })

export const getRampTransaction = (id: string) =>
  request(`transactions/${encodeURIComponent(id)}`, { anchor: true, auth: true })

/** Off-ramp step 2: build the memo'd USDC payment, sign it, submit to Horizon. */
export async function sendWithdrawPayment(
  publicKey: string,
  sign: SignFn,
  p: { amount: string; anchorAccount: string; memo: string; memoType?: string },
  asset?: { code: string; issuer: string },
): Promise<string> {
  if (asset) {
    const balance = await getAssetBalance(publicKey, asset)
    if (balance < Number(p.amount)) {
      throw new Error(
        `Not enough ${asset.code}: you have ${balance}, need ${p.amount}. Complete a deposit first ` +
          `(simulate the bank transfer with the link shown under "On-ramp"), or lower the amount.`,
      )
    }
  }
  const { xdr, networkPassphrase } = await request('withdraw/build-payment', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(p),
  })
  const signed = await signToString(sign, xdr, networkPassphrase, publicKey)
  const res = (await submitToHorizon(signed)) as { hash?: string }
  return res.hash ?? 'submitted'
}

/**
 * Makes sure the wallet has a trustline for the anchor's asset (USDC) before an on-ramp.
 * Adds it with a single signed changeTrust transaction when missing. Returns true if one was added.
 */
export async function ensureTrustline(
  publicKey: string,
  sign: SignFn,
  asset: { code: string; issuer: string },
  networkPassphrase: string = Networks.TESTNET,
): Promise<boolean> {
  const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`)
  if (res.status === 404) {
    throw new Error('Account not found on the network. Fund it with testnet XLM first (friendbot).')
  }
  if (!res.ok) throw new Error(`Horizon error (${res.status})`)
  const account = await res.json()
  const has = (account.balances as { asset_code?: string; asset_issuer?: string }[]).some(
    (b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer,
  )
  if (has) return false

  const tx = new TransactionBuilder(new Account(publicKey, account.sequence), {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(asset.code, asset.issuer) }))
    .setTimeout(300)
    .build()
  const signed = await signToString(sign, tx.toXDR(), networkPassphrase, publicKey)
  await submitToHorizon(signed)
  return true
}

async function getAssetBalance(publicKey: string, asset: { code: string; issuer: string }): Promise<number> {
  const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`)
  if (!res.ok) throw new Error(`Horizon error (${res.status}) while checking ${asset.code} balance`)
  const account = await res.json()
  const line = (account.balances as { asset_code?: string; asset_issuer?: string; balance: string }[]).find(
    (b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer,
  )
  return line ? Number(line.balance) : 0
}
