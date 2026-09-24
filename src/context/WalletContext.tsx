import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit'
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter'
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull'
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr'
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { WalletStatus } from '../types/stellar'
import { WalletContext } from './walletContextValue'
import { classifyWalletError, isWalletCancellationError } from '../lib/walletErrors'

export type { WalletErrorType } from '../lib/walletErrors'

// ─── Kit initialisation (once per page load) ──────────────────────────────────

StellarWalletsKit.init({
  modules: [
    new FreighterModule(),
    new xBullModule(),
    new LobstrModule(),
    new AlbedoModule(),
  ],
  network: Networks.TESTNET,
})

const WALLET_SESSION_STORAGE_KEY = 'terminal8_wallet_session'

interface StoredWalletSession {
  publicKey: string
  network: string | null
  networkPassphrase: string | null
  sorobanRpcUrl: string | null
  networkUrl: string | null
}

function loadStoredWalletSession(): StoredWalletSession | null {
  try {
    const raw = localStorage.getItem(WALLET_SESSION_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoredWalletSession
      if (parsed && typeof parsed.publicKey === 'string' && parsed.publicKey.startsWith('G') && parsed.publicKey.length === 56) {
        return parsed
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function saveWalletSession(session: StoredWalletSession | null) {
  try {
    if (!session) {
      localStorage.removeItem(WALLET_SESSION_STORAGE_KEY)
    } else {
      localStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify(session))
    }
  } catch {
    /* ignore */
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const initialSession = useMemo(() => loadStoredWalletSession(), [])
  const [status, setStatus] = useState<WalletStatus>(() => (initialSession ? 'CONNECTED' : 'DISCONNECTED'))
  const [publicKey, setPublicKey] = useState<string | null>(() => (initialSession ? initialSession.publicKey : null))
  const [network, setNetwork] = useState<string | null>(() => (initialSession ? initialSession.network : null))
  const [networkPassphrase, setNetworkPassphrase] = useState<string | null>(() => (initialSession ? initialSession.networkPassphrase : null))
  const [sorobanRpcUrl, setSorobanRpcUrl] = useState<string | null>((() => (initialSession ? initialSession.sorobanRpcUrl : null)))
  const [networkUrl, setNetworkUrl] = useState<string | null>(() => (initialSession ? initialSession.networkUrl : null))
  const [error, setError] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<ReturnType<typeof classifyWalletError>['type'] | null>(null)

  const connect = useCallback(async () => {
    setStatus('CONNECTING')
    setError(null)
    setErrorType(null)

    try {
      // Opens multi-wallet selection modal (Freighter, xBull, LOBSTR, Albedo)
      const { address } = await StellarWalletsKit.authModal()

      const networkInfo = await StellarWalletsKit.getNetwork()
      const passphrase = networkInfo.networkPassphrase

      // Map network passphrase to Horizon / Soroban RPC URLs
      const isTestnet = passphrase.toLowerCase().includes('test')
      const resolvedNetworkUrl = isTestnet
        ? import.meta.env.VITE_HORIZON_TESTNET_URL || 'https://horizon-testnet.stellar.org'
        : import.meta.env.VITE_HORIZON_PUBLIC_URL || 'https://horizon.stellar.org'
      const resolvedSorobanUrl = isTestnet
        ? import.meta.env.VITE_SOROBAN_TESTNET_URL || 'https://soroban-testnet.stellar.org'
        : import.meta.env.VITE_SOROBAN_PUBLIC_URL || 'https://soroban.stellar.org'
      const resolvedNetwork = isTestnet ? 'TESTNET' : 'PUBLIC'

      setPublicKey(address)
      setNetwork(resolvedNetwork)
      setNetworkPassphrase(passphrase)
      setSorobanRpcUrl(resolvedSorobanUrl)
      setNetworkUrl(resolvedNetworkUrl)
      setStatus('CONNECTED')

      saveWalletSession({
        publicKey: address,
        network: resolvedNetwork,
        networkPassphrase: passphrase,
        sorobanRpcUrl: resolvedSorobanUrl,
        networkUrl: resolvedNetworkUrl,
      })
    } catch (reason) {
      if (isWalletCancellationError(reason)) {
        setStatus('DISCONNECTED')
        setError(null)
        setErrorType(null)
        return
      }

      const { type, message } = classifyWalletError(reason)
      setPublicKey(null)
      setNetwork(null)
      setNetworkPassphrase(null)
      setSorobanRpcUrl(null)
      setNetworkUrl(null)
      setStatus('ERROR')
      setError(message)
      setErrorType(type)
    }
  }, [])

  const reset = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect()
    } catch {
      // ignore disconnect errors
    }
    setStatus('DISCONNECTED')
    setPublicKey(null)
    setNetwork(null)
    setNetworkPassphrase(null)
    setSorobanRpcUrl(null)
    setNetworkUrl(null)
    setError(null)
    setErrorType(null)
    saveWalletSession(null)
  }, [])

  // Listen for kit-level disconnect events
  useEffect(() => {
    const unsub = StellarWalletsKit.on('DISCONNECT' as never, () => {
      setStatus('DISCONNECTED')
      setPublicKey(null)
      setNetwork(null)
      setNetworkPassphrase(null)
      setSorobanRpcUrl(null)
      setNetworkUrl(null)
      setError(null)
      setErrorType(null)
      saveWalletSession(null)
    })
    return unsub
  }, [])

  const value = useMemo(
    () => ({
      status,
      publicKey,
      network,
      networkPassphrase,
      sorobanRpcUrl,
      networkUrl,
      error,
      errorType,
      connect,
      reset,
    }),
    [
      connect,
      error,
      errorType,
      network,
      networkPassphrase,
      networkUrl,
      publicKey,
      reset,
      sorobanRpcUrl,
      status,
    ],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
