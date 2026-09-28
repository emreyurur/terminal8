import { useEffect, useRef, useState, useCallback } from 'react'
import {
  fetchLendingDashboard,
  fetchUserPortfolio,
  type LendingDashboardResponse,
  type PortfolioPositionsResponse,
} from '../services/terminal8Api'

export interface PortfolioCombinedData {
  lendingDashboard: LendingDashboardResponse
  portfolio: PortfolioPositionsResponse
}

export type PortfolioDashboardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: PortfolioCombinedData }
  | { status: 'error' }

export function usePortfolioDashboard(publicKey: string | null) {
  const [state, setState] = useState<PortfolioDashboardState>({ status: 'idle' })
  const requestVersion = useRef(0)

  const refresh = useCallback(async (silent = false) => {
    const version = ++requestVersion.current
    if (!publicKey) {
      setState({ status: 'idle' })
      return
    }
    if (!silent) setState({ status: 'loading' })
    try {
      const [lendingDashboard, portfolio] = await Promise.all([
        fetchLendingDashboard(publicKey).catch(() => ({}) as LendingDashboardResponse),
        fetchUserPortfolio(publicKey).catch(() => ({
          userPublicKey: publicKey,
          totalValueUsd: 0,
          totalPnlUsd: 0,
          positions: [],
        })),
      ])
      if (version === requestVersion.current) {
        setState({
          status: 'success',
          data: { lendingDashboard, portfolio },
        })
      }
    } catch {
      if (!silent && version === requestVersion.current) setState({ status: 'error' })
    }
  }, [publicKey])

  useEffect(() => {
    queueMicrotask(() => {
      refresh()
    })
    return () => {
      requestVersion.current += 1
    }
  }, [refresh])

  return { state, refresh }
}
