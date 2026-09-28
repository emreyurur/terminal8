import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPoolDashboard, type PoolDashboardResponse } from '../services/terminal8Api'

export type PoolDashboardData = PoolDashboardResponse

export type PoolDashboardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: PoolDashboardData }
  | { status: 'error' }

export function usePoolDashboard(poolId: string | null) {
  const [state, setState] = useState<PoolDashboardState>({ status: 'idle' })
  const requestVersion = useRef(0)

  const refresh = useCallback(async (silent = false) => {
    const version = ++requestVersion.current
    if (!poolId) {
      setState({ status: 'idle' })
      return
    }

    if (!silent) setState({ status: 'loading' })
    try {
      const data = await fetchPoolDashboard(poolId)
      if (version === requestVersion.current) setState({ status: 'success', data })
    } catch {
      if (!silent && version === requestVersion.current) setState({ status: 'error' })
    }
  }, [poolId])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
    return () => {
      requestVersion.current += 1
    }
  }, [refresh])

  return { state, refresh }
}
