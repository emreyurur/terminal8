import { API_BASE, clearStoredJwtToken, getStoredJwtToken, loginWithFreighterFlow, submitToHorizon } from './terminal8Api'
import { signToString, type SignFn } from './rampApi'

export type SingleAssetPlan = {
  sourceAsset: string
  destAsset: string
  swapAmount: number
  receiveAmount: number
  sendMax: number
  expectedDepositSource: number
  expectedDepositDest: number
  priceImpactPct: number
  estimatedLeftoverSource: number
  slippageBps: number
  addsTrustlines: string[]
}

export type SingleAssetBuild = {
  xdr: string
  networkPassphrase: string
  plan: SingleAssetPlan
}

export type SingleAssetParams = {
  poolId: string
  /** Asset code, or CODE:ISSUER when both sides share a code. */
  sourceAsset: string
  amount: number
  slippageBps: number
}

/** Turns a Nest error body ({ message }) into readable text. */
async function errorText(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const body = JSON.parse(text)
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    if (message) return String(message)
  } catch {
    /* not JSON */
  }
  return text || `Request failed (${res.status})`
}

async function requestBuild(params: SingleAssetParams, jwt: string): Promise<Response> {
  return fetch(`${API_BASE}api/v1/transactions/single-asset-deposit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

/**
 * Asks the backend for the swap + deposit plan and the unsigned transaction.
 * Logs in (one wallet signature) if there is no valid session yet.
 */
export async function previewSingleAssetDeposit(
  publicKey: string,
  sign: SignFn,
  params: SingleAssetParams,
): Promise<SingleAssetBuild> {
  let jwt = getStoredJwtToken() ?? (await loginWithFreighterFlow(publicKey, sign))
  let res = await requestBuild(params, jwt)

  if (res.status === 401) {
    clearStoredJwtToken()
    jwt = await loginWithFreighterFlow(publicKey, sign)
    res = await requestBuild(params, jwt)
  }
  if (!res.ok) throw new Error(await errorText(res))
  return res.json()
}

/** Signs the prepared transaction and submits it. One signature covers trustlines, swap, and deposit. */
export async function submitSingleAssetDeposit(
  publicKey: string,
  sign: SignFn,
  built: SingleAssetBuild,
  poolId: string,
): Promise<{ hash: string }> {
  const signed = await signToString(sign, built.xdr, built.networkPassphrase, publicKey)
  const res = await submitToHorizon(signed)
  const hash = res.hash ?? res.id ?? `tx_${Date.now()}`

  // Best effort: keep the backend portfolio in step, a failure must not hide a confirmed deposit.
  try {
    const jwt = getStoredJwtToken()
    if (jwt) {
      await fetch(`${API_BASE}api/v1/portfolio/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          userAddress: publicKey,
          txHash: hash,
          poolId,
          amount: built.plan.expectedDepositSource,
          action: 'DEPOSIT',
        }),
      })
    }
  } catch (err) {
    console.warn('Portfolio sync non-fatal warning:', err)
  }

  return { hash }
}
