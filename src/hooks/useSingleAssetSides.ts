import { useCallback, useEffect, useState } from 'react'
import { poolSidesForAccount, type PoolSide } from '../lib/singleAsset'

type State = { sides: PoolSide[]; loading: boolean; error: string | null }

/**
 * The two assets of a pool (exact CODE:ISSUER from Horizon) and how much of each the wallet holds.
 * Looked up from live Horizon data because the pool list drops issuers, and several tokens share a code.
 */
export function useSingleAssetSides(poolId: string, publicKey: string | null, horizonUrl: string | null) {
  const [state, setState] = useState<State>({ sides: [], loading: false, error: null })
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!publicKey || !horizonUrl) return
    const controller = new AbortController()
    const base = horizonUrl.replace(/\/$/, '')

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const [poolRes, accountRes] = await Promise.all([
          fetch(`${base}/liquidity_pools/${poolId}`, { signal: controller.signal }),
          fetch(`${base}/accounts/${publicKey}`, { signal: controller.signal }),
        ])
        if (!poolRes.ok) throw new Error('Pool not found on the network.')
        if (!accountRes.ok) throw new Error('Account not found. Fund it with testnet XLM first.')
        const pool = await poolRes.json()
        const account = await accountRes.json()
        setState({ sides: poolSidesForAccount(pool.reserves, account), loading: false, error: null })
      } catch (reason) {
        if (controller.signal.aborted) return
        setState({ sides: [], loading: false, error: reason instanceof Error ? reason.message : 'Could not load balances.' })
      }
    }

    void load()
    return () => controller.abort()
  }, [poolId, publicKey, horizonUrl, tick])

  return { ...state, refresh }
}
