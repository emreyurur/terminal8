const rawApiBase = import.meta.env.VITE_API_BASE_URL || 'https://batuhantekin.icu/stellar/'
export const API_BASE = rawApiBase.endsWith('/') ? rawApiBase : `${rawApiBase}/`
export const HORIZON_URL = import.meta.env.VITE_HORIZON_TESTNET_URL || 'https://horizon-testnet.stellar.org'
export const TESTNET_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'

export function assertTestnetPassphrase(networkPassphrase: string): void {
  if (networkPassphrase !== TESTNET_NETWORK_PASSPHRASE) {
    throw new Error('Terminal8 rejected a non-Testnet transaction.')
  }
}

const JWT_STORAGE_KEY = 'terminal8_jwt_token'

/**
 * Retrieves stored JWT access token from localStorage.
 */
export function getStoredJwtToken(): string | null {
  try {
    return localStorage.getItem(JWT_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Persists JWT access token in localStorage.
 */
export function setStoredJwtToken(token: string): void {
  try {
    localStorage.setItem(JWT_STORAGE_KEY, token)
  } catch {
    // ignore storage errors
  }
}

/**
 * Clears stored JWT access token from localStorage.
 */
export function clearStoredJwtToken(): void {
  try {
    localStorage.removeItem(JWT_STORAGE_KEY)
  } catch {
    // ignore storage errors
  }
}

export interface AuthChallengeResponse {
  transaction: string
  networkPassphrase: string
}

export interface AuthVerifyResponse {
  accessToken: string
}

export interface BuildTransactionParams {
  poolId: string
  action: 'DEPOSIT' | 'WITHDRAW'
  amountA?: number
  amountB?: number
  shareAmount?: number
  slippageBps?: number
  userAddress?: string
  publicKey?: string
}

export interface BuildTransactionResponse {
  xdr: string
  networkPassphrase: string
  [key: string]: unknown
}

export interface HorizonSubmitResponse {
  hash?: string
  id?: string
  [key: string]: unknown
}

export interface SyncPortfolioParams {
  poolId: string
  sharesAmount: string
  assetAAmount: string
  assetBAmount: string
}

/**
 * 1. Requests auth challenge from backend for a given public key
 */
export async function getAuthChallenge(publicKey: string): Promise<AuthChallengeResponse> {
  const url = `${API_BASE}auth/challenge?publicKey=${encodeURIComponent(publicKey)}`
  const res = await fetch(url)
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to fetch challenge (${res.status}): ${errorText}`)
  }
  return res.json()
}

/**
 * 2. Verifies signed XDR and returns JWT access token
 */
export async function verifyAuthChallenge(signedXdr: string): Promise<string> {
  const res = await fetch(`${API_BASE}auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedXdr }),
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to verify challenge (${res.status}): ${errorText}`)
  }
  const data: AuthVerifyResponse = await res.json()
  if (data.accessToken) {
    setStoredJwtToken(data.accessToken)
  }
  return data.accessToken
}

export type FreighterSignFn = (
  xdr: string,
  opts: { networkPassphrase: string; accountToSign?: string },
) => Promise<string | { signedTxXdr: string }>

export async function signToString(
  signFn: FreighterSignFn,
  xdr: string,
  networkPassphrase: string,
  accountToSign?: string,
): Promise<string> {
  const res = await signFn(xdr, { networkPassphrase, accountToSign })
  const signed = typeof res === 'string' ? res : res.signedTxXdr
  if (!signed) {
    const reason = (res as { error?: { message?: string } | string }).error
    const detail = typeof reason === 'string' ? reason : reason?.message
    throw new Error(`Wallet did not sign the transaction${detail ? `: ${detail}` : ' (rejected or site not authorized)'}`)
  }
  return signed
}

type BuildTransactionDto = {
  poolId: string
  action: 'DEPOSIT' | 'WITHDRAW'
  amountA: number
  amountB: number
  shareAmount: number
  slippageBps?: number
}

function toBuildTransactionDto(params: BuildTransactionParams): BuildTransactionDto {
  const deposit = params.action === 'DEPOSIT'
  return {
    poolId: params.poolId,
    action: params.action,
    amountA: deposit ? Number(params.amountA ?? 0) : 0,
    amountB: deposit ? Number(params.amountB ?? 0) : 0,
    shareAmount: deposit ? 0 : Number(params.shareAmount ?? 0),
    ...(params.slippageBps === undefined ? {} : { slippageBps: Number(params.slippageBps) }),
  }
}

async function normalizeSignedXdr(
  signFn: FreighterSignFn,
  xdr: string,
  networkPassphrase: string,
  accountToSign?: string,
): Promise<string> {
  return signToString(signFn, xdr, networkPassphrase, accountToSign)
}

/**
 * Full Freighter authentication flow: challenge -> sign -> verify -> store JWT token
 */
export async function loginWithFreighterFlow(
  publicKey: string,
  signTransactionFn: FreighterSignFn,
): Promise<string> {
  const challenge = await getAuthChallenge(publicKey)
  assertTestnetPassphrase(challenge.networkPassphrase)
  const signedXdr = await normalizeSignedXdr(
    signTransactionFn,
    challenge.transaction,
    challenge.networkPassphrase,
  )
  const token = await verifyAuthChallenge(signedXdr)
  return token
}

/**
 * 3. Fetch portfolio & PnL for user from backend
 */
export async function getPortfolioFromApi(publicKey: string, token?: string | null): Promise<unknown> {
  const jwt = token ?? getStoredJwtToken()
  if (!jwt) {
    throw new Error('JWT Token not found. Please login first.')
  }
  const res = await fetch(`${API_BASE}api/v1/portfolio/${encodeURIComponent(publicKey)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to get portfolio (${res.status}): ${errorText}`)
  }
  return res.json()
}

/**
 * 4. Build deposit / withdraw XDR transaction
 */
export async function buildTransactionFromApi(
  params: BuildTransactionParams,
  token?: string | null,
): Promise<BuildTransactionResponse> {
  const jwt = token ?? getStoredJwtToken()
  if (!jwt) {
    throw new Error('JWT Token not found. Please login first.')
  }
  const res = await fetch(`${API_BASE}api/v1/transactions/build`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toBuildTransactionDto(params)),
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to build transaction (${res.status}): ${errorText}`)
  }
  return res.json()
}

/**
 * Complete flow for interacting with /api/v1/transactions/build for DEPOSIT & WITHDRAW.
 * Automatically handles JWT auth challenge if token is missing or expired (401).
 */
export async function executeApiPoolTransaction({
  publicKey,
  signTransactionFn,
  params,
}: {
  publicKey: string
  signTransactionFn: FreighterSignFn
  params: BuildTransactionParams
}): Promise<{ hash: string; status: string; xdr: string }> {
  let jwt = getStoredJwtToken()

  // If no token, authenticate via challenge -> sign -> verify
  if (!jwt) {
    jwt = await loginWithFreighterFlow(publicKey, signTransactionFn)
  }

  let buildRes: BuildTransactionResponse
  try {
    buildRes = await buildTransactionFromApi(params, jwt)
  } catch (err: unknown) {
    // If 401 Unauthorized or token expired, re-login once and retry
    if (err instanceof Error && (err.message.includes('401') || err.message.includes('Unauthorized'))) {
      clearStoredJwtToken()
      jwt = await loginWithFreighterFlow(publicKey, signTransactionFn)
      buildRes = await buildTransactionFromApi(params, jwt)
    } else {
      throw err
    }
  }

  if (!buildRes.xdr) {
    throw new Error('No XDR returned from transaction build API.')
  }

  let networkPassphrase = buildRes.networkPassphrase || TESTNET_NETWORK_PASSPHRASE
  assertTestnetPassphrase(networkPassphrase)
  let signedXdr = await normalizeSignedXdr(signTransactionFn, buildRes.xdr, networkPassphrase, publicKey)
  let submitRes: HorizonSubmitResponse | undefined

  try {
    submitRes = await submitToHorizon(signedXdr)
  } catch (err: unknown) {
    const errStr = err instanceof Error ? err.message : String(err)
    if (errStr.includes('tx_bad_auth') || errStr.includes('bad_auth') || errStr.includes('401')) {
      clearStoredJwtToken()
      jwt = await loginWithFreighterFlow(publicKey, signTransactionFn)
      buildRes = await buildTransactionFromApi(params, jwt)
      networkPassphrase = buildRes.networkPassphrase || TESTNET_NETWORK_PASSPHRASE
      assertTestnetPassphrase(networkPassphrase)
      signedXdr = await normalizeSignedXdr(signTransactionFn, buildRes.xdr, networkPassphrase, publicKey)
      submitRes = await submitToHorizon(signedXdr)
    } else {
      throw err
    }
  }

  const transactionHash = submitRes?.hash || submitRes?.id
  if (!transactionHash) {
    throw new Error('Horizon confirmed the request without returning a transaction hash.')
  }

  // Trigger non-blocking portfolio sync so dashboard reflects new position immediately
  try {
    await fetch(
      `${API_BASE}api/v1/portfolio/sync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          userAddress: publicKey,
          txHash: transactionHash,
          poolId: params.poolId,
          amount: params.amountA ?? params.shareAmount ?? 0,
          action: params.action,
        }),
      },
    )
  } catch (syncErr) {
    console.warn('Portfolio sync non-fatal warning:', syncErr)
  }

  return {
    hash: transactionHash,
    status: 'SUCCESS',
    xdr: buildRes.xdr,
  }
}

/**
 * 5. Submit signed XDR transaction to Horizon Testnet
 */
export async function submitToHorizon(signedXdr: string): Promise<HorizonSubmitResponse> {
  const params = new URLSearchParams()
  params.append('tx', signedXdr)

  const res = await fetch(`${HORIZON_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(JSON.stringify(data.extras?.result_codes || data, null, 2))
  }
  return data as HorizonSubmitResponse
}

/**
 * 6. Sync portfolio after transaction
 */
export async function syncPortfolioToApi(
  params: SyncPortfolioParams,
  token?: string | null,
): Promise<unknown> {
  const jwt = token ?? getStoredJwtToken()
  if (!jwt) {
    throw new Error('JWT Token not found. Please login first.')
  }
  const res = await fetch(`${API_BASE}api/v1/portfolio/sync`, {
    method: 'POST',
    headers: {
      accept: '*/*',
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to sync portfolio (${res.status}): ${errorText}`)
  }
  return res.json()
}

// ─── Pool Risk & On-Chain Trust Score API ──────────────────────────────────────

export interface PoolRiskResponse {
  poolId: string
  trustScore: number
  tvlScore: number
  volatilityScore: number
  apyScore: number
  compositeScore: number
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW'
  estimatedApy?: number
}

function parseRiskNumber(value: unknown, field: string, max = 100): number {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    throw new Error(`Invalid pool risk field: ${field}`)
  }
  return parsed
}

export function parsePoolRiskResponse(payload: unknown): PoolRiskResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid pool risk response')
  }

  const data = payload as Record<string, unknown>
  const riskLevel = String(data.riskLevel ?? '').toUpperCase()
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(riskLevel)) {
    throw new Error('Invalid pool risk field: riskLevel')
  }

  const estimatedApy = data.estimatedApy == null
    ? undefined
    : parseRiskNumber(data.estimatedApy, 'estimatedApy', Number.MAX_SAFE_INTEGER)

  return {
    poolId: String(data.poolId ?? ''),
    trustScore: parseRiskNumber(data.trustScore, 'trustScore'),
    tvlScore: parseRiskNumber(data.tvlScore, 'tvlScore'),
    volatilityScore: parseRiskNumber(data.volatilityScore, 'volatilityScore'),
    apyScore: parseRiskNumber(data.apyScore, 'apyScore'),
    compositeScore: parseRiskNumber(data.compositeScore, 'compositeScore'),
    riskLevel: riskLevel as PoolRiskResponse['riskLevel'],
    estimatedApy,
  }
}

/**
 * Fetch Risk & Trust Score details for a specific pool
 */
export async function fetchPoolRisk(poolId: string, signal?: AbortSignal): Promise<PoolRiskResponse> {
  const res = await fetch(`${API_BASE}api/v1/pools/${encodeURIComponent(poolId)}/risk`, {
    headers: { accept: 'application/json' },
    signal,
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch pool risk (${res.status})`)
  }
  return parsePoolRiskResponse(await res.json())
}

export interface PoolDashboardResponse {
  vaultOverview?: {
    totalSupplied: number
    totalBorrowed: number
    utilization: number
    supplyApy: number
    supplyApy90dAvg: number
  }
  strategyOverview?: {
    name: string
    profile: string
    description: string
  }
  chartData?: Array<{
    timestamp: string
    supplyApy: number
    totalSupply: number
  }>
}

export async function fetchPoolDashboard(poolId: string, signal?: AbortSignal): Promise<PoolDashboardResponse> {
  const res = await fetch(`${API_BASE}api/v1/pools/${encodeURIComponent(poolId)}/dashboard`, {
    headers: { accept: 'application/json' },
    signal,
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch pool dashboard (${res.status})`)
  }
  return res.json()
}

/**
 * Fetch pools filtered by risk level
 */
export async function fetchPoolsByRiskLevel(level: 'HIGH' | 'MEDIUM' | 'LOW' | string, limit = 15): Promise<unknown> {
  const res = await fetch(`${API_BASE}api/v1/pools/level/${level}?page=1&limit=${limit}`, {
    headers: { accept: '*/*' },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch pools by risk level (${res.status})`)
  }
  return res.json()
}

// ─── Portfolio & Lending Dashboard Endpoints ──────────────────────────────────

export interface LendingDashboardResponse {
  globalStats?: {
    marketSizeUsd: number
    vaultDepositsUsd: number
  }
  userOverview?: {
    activePositions: number
    positionsValueUsd: number
    avgApy: number
    interestEarnedUsd: number
  }
  assets?: unknown[]
}

export interface PortfolioPositionsResponse {
  userPublicKey: string
  totalValueUsd: number
  totalPnlUsd: number
  positions: Array<{
    poolId?: string
    asset?: string
    sharesOwned?: number | string
    shares?: number | string
    amount?: number | string
    valueUsd?: number
    pnlUsd?: number
    [key: string]: unknown
  }>
}

export async function fetchLendingDashboard(publicKey: string): Promise<LendingDashboardResponse> {
  const jwt = getStoredJwtToken()
  const headers: Record<string, string> = { accept: '*/*' }
  if (jwt) headers.Authorization = `Bearer ${jwt}`

  const res = await fetch(`${API_BASE}api/v1/portfolio/lending-dashboard/${encodeURIComponent(publicKey)}`, {
    headers,
  })
  if (!res.ok) throw new Error(`Failed to fetch lending dashboard (${res.status})`)
  return res.json()
}

export async function fetchUserPortfolio(publicKey: string): Promise<PortfolioPositionsResponse> {
  const jwt = getStoredJwtToken()
  const headers: Record<string, string> = { accept: 'application/json' }
  if (jwt) headers.Authorization = `Bearer ${jwt}`

  const res = await fetch(`${API_BASE}api/v1/portfolio/${encodeURIComponent(publicKey)}`, {
    headers,
  })
  if (!res.ok) throw new Error(`Failed to fetch user portfolio (${res.status})`)
  return res.json()
}

export interface ApiHistoryItem {
  id?: string
  hash?: string
  txHash?: string
  type?: string
  action?: string
  poolId?: string
  asset?: string
  tokenCode?: string
  tokens?: string
  amount?: number | string
  value?: number | string
  usdValue?: number | string
  timestamp?: string | number
  createdAt?: string | number
  date?: string
  [key: string]: unknown
}

/**
 * Fetches deposit and withdraw transaction history from /api/v1/history?limit=...&page=...
 */
export async function fetchTransactionHistory(
  limit = 10,
  page = 1,
  token?: string | null,
): Promise<ApiHistoryItem[]> {
  const jwt = token ?? getStoredJwtToken()
  const headers: Record<string, string> = {
    accept: '*/*',
  }
  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`
  }

  try {
    const url = `${API_BASE}api/v1/history?limit=${limit}&page=${page}`
    const res = await fetch(url, { method: 'GET', headers })
    if (!res.ok) {
      return []
    }
    const json = await res.json()
    if (Array.isArray(json)) return json
    if (json.data && Array.isArray(json.data)) return json.data
    if (json.items && Array.isArray(json.items)) return json.items
    if (json.history && Array.isArray(json.history)) return json.history
    if (json.transactions && Array.isArray(json.transactions)) return json.transactions
    return []
  } catch (err) {
    console.debug('Failed to fetch history from API:', err)
    return []
  }
}

/**
 * Reads the wallet's LP share balance for a pool straight from Horizon.
 * Returns null when the account has no share line for that pool.
 */
export async function getOnChainLpShares(
  horizonUrl: string,
  publicKey: string,
  poolId: string,
): Promise<string | null> {
  const res = await fetch(`${horizonUrl.replace(/\/$/, '')}/accounts/${publicKey}`)
  if (!res.ok) throw new Error(`Horizon returned ${res.status} while reading LP shares.`)
  const account = (await res.json()) as {
    balances: { liquidity_pool_id?: string; balance: string }[]
  }
  return account.balances.find((b) => b.liquidity_pool_id === poolId)?.balance ?? null
}
