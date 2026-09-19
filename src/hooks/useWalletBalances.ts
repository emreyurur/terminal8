import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWallet } from '../context/useWallet'
import type { WalletBalance } from '../types/stellar'

type HorizonBalance = {
  asset_code?: string
  asset_issuer?: string
  asset_type: string
  balance: string
  liquidity_pool_id?: string
}

type HorizonAccountResponse = {
  balances: HorizonBalance[]
}

type BalanceState = 'idle' | 'loading' | 'success' | 'error'

function normalizeHorizonUrl(networkUrl: string) {
  return networkUrl.replace(/\/$/, '')
}

function toWalletBalance(balance: HorizonBalance): WalletBalance {
  const isNative = balance.asset_type === 'native'
  const code = isNative ? 'XLM' : balance.asset_code ?? 'UNKNOWN'
  const issuer = isNative ? 'native' : balance.asset_issuer ?? 'unknown issuer'

  // LP share lines carry no code/issuer, so every pool would otherwise get the same id.
  const poolId = balance.liquidity_pool_id

  return {
    id: poolId ? `lp-${poolId}` : `${code}-${issuer}`,
    code,
    issuer,
    balance: balance.balance,
    assetType: balance.asset_type,
    isNative,
    ...(poolId ? { poolId } : {}),
  }
}

export function useWalletBalances() {
  const { networkUrl, publicKey, status } = useWallet()
  const [balances, setBalances] = useState<WalletBalance[]>([])
  const [balanceStatus, setBalanceStatus] = useState<BalanceState>('idle')
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  // Stable identity: consumers use it in effect dependencies, so it must not change when balances do.
  const refreshBalances = useCallback(() => setRefreshTrigger((n) => n + 1), [])
  const ready = status === 'CONNECTED' && Boolean(publicKey) && Boolean(networkUrl)

  useEffect(() => {
    if (!ready || !publicKey || !networkUrl) {
      return
    }

    const controller = new AbortController()
    const accountId = publicKey
    const horizonUrl = normalizeHorizonUrl(networkUrl)

    async function loadBalances() {
      setBalanceStatus('loading')
      setBalanceError(null)

      try {
        const response = await fetch(`${horizonUrl}/accounts/${accountId}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Horizon returned ${response.status} for this account.`)
        }

        const account = (await response.json()) as HorizonAccountResponse
        const rawBalances = account.balances.map(toWalletBalance)
        const sortedBalances = rawBalances.sort((a, b) => {
          if (a.isNative) return -1
          if (b.isNative) return 1
          return Number(b.balance) - Number(a.balance)
        })

        const seenCodesWithBalance = new Set<string>()
        const cleanBalances = sortedBalances.filter((item) => {
          const balNum = Number(item.balance) || 0
          if (balNum > 0) {
            seenCodesWithBalance.add(item.code.toUpperCase())
            return true
          }
          if (seenCodesWithBalance.has(item.code.toUpperCase())) {
            return false
          }
          return true
        })

        setBalances(cleanBalances)
        setBalanceStatus('success')
      } catch (reason) {
        if (controller.signal.aborted) {
          return
        }

        setBalances([])
        setBalanceStatus('error')
        setBalanceError(reason instanceof Error ? reason.message : 'Could not load wallet balances.')
      }
    }

    void loadBalances()

    return () => controller.abort()
  }, [networkUrl, publicKey, ready, refreshTrigger])

  return useMemo(
    () => ({
      balances: ready ? balances : [],
      balanceStatus: ready ? balanceStatus : 'idle',
      balanceError: ready ? balanceError : null,
      refreshBalances,
    }),
    [balanceError, balanceStatus, balances, ready, refreshBalances],
  )
}
