import { useEffect, useState } from 'react'
import { fetchPoolDashboard, type PoolDashboardResponse } from '../services/terminal8Api'

export type PoolDashboardData = PoolDashboardResponse

export type PoolDashboardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: PoolDashboardData }
  | { status: 'error' }

export function usePoolDashboard(poolId: string | null): PoolDashboardState {
  const [state, setState] = useState<PoolDashboardState>({ status: 'idle' })

  useEffect(() => {
    if (!poolId) {
      queueMicrotask(() => setState({ status: 'idle' }))
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setState({ status: 'loading' })
    })

    const controller = new AbortController()
    fetchPoolDashboard(poolId, controller.signal)
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [poolId])

  return state
}
