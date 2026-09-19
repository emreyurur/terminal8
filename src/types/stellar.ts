export type WalletStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'

export type FreighterWallet = {
  getPublicKey: () => Promise<string> | string
}

export type LegacyFreighterApi = {
  getPublicKey?: () => Promise<string> | string
  requestAccess?: () => Promise<{ address?: string; publicKey?: string; error?: unknown }>
  isConnected?: () => Promise<boolean | { isConnected: boolean }> | boolean | { isConnected: boolean }
  signTransaction?: (xdr: string, opts?: { networkPassphrase?: string }) => Promise<string>
}

export type StellarWallets = {
  freighter?: FreighterWallet
}

declare global {
  interface Window {
    freighter?: boolean
    freighterApi?: LegacyFreighterApi
    stellarWallets?: StellarWallets
  }
}

export type TrustlineAsset = {
  code: 'XLM' | 'USDC' | 'AQUA' | 'yXLM'
  issuer: string
  balance: number
  usdValue: number
  dust: boolean
  route: string
}

export type WalletBalance = {
  id: string
  code: string
  issuer: string
  balance: string
  assetType: string
  isNative: boolean
  /** Set for liquidity pool share lines (Horizon gives them no asset code). */
  poolId?: string
}

export type YieldPosition = {
  protocol: string
  asset: string
  apy: number
  staked: string
  unlockDate: string
  sorobanContract: string
}

export type RouteHop = {
  label: string
  sublabel: string
}

export type RiskProfile = 'Conservative' | 'Moderate' | 'Aggressive'

export type PoolReputation = {
  liquidity: number
  age: number
  audit: number
  activity: number
}

export type LocalPosition = {
  id: string
  amount: number
  asset: string
  hash: string
  protocol: string
  status: string
  timestamp: string
  openedAt: number
  apy: number
  category: 'Lending' | 'AMM LP' | 'AMM Rewards'
  poolId: string
}

export type DeFiPool = {
  id: string
  protocol: string
  category: 'Lending' | 'AMM LP' | 'AMM Rewards'
  asset: string
  secondaryAsset?: string
  apy: number
  tvl: string
  tvlRaw: number
  utilization?: number
  volume24h?: string
  feeBp?: number
  reserveA?: number
  reserveB?: number
  reputation: PoolReputation
  risk: RiskProfile
  method: 'supply()' | 'addLiquidity()'
  rationale: string
  contractId: string
}
