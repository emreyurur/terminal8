import { useEffect, useState } from 'react'
import { fetchPoolRisk, type PoolRiskResponse } from '../services/terminal8Api'

export type PoolRiskData = PoolRiskResponse

export type PoolRiskState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: PoolRiskData }
  | { status: 'error' }

export function usePoolRisk(poolId: string | null): PoolRiskState {
  const [state, setState] = useState<PoolRiskState>({ status: 'idle' })

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
    fetchPoolRisk(poolId, controller.signal)
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
