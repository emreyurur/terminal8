import { useCallback, useEffect, useRef, useState } from 'react'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { showBrowserNotification } from '../lib/browserNotifications'
import { AlertsAuthError, fetchAlerts, fetchAlertsConfig, fetchNotifications, markNotificationsRead, type AlertNotification, type PriceAlert, type AlertsConfig } from '../services/alertsApi'
import { getStoredJwtToken, loginWithFreighterFlow } from '../services/terminal8Api'

const SESSION_KEY = 'terminal8_alert_session'
function hasSession(scope: string) {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    return !!getStoredJwtToken() && session?.scope === scope && session?.token === getStoredJwtToken()
  } catch { return false }
}

export function useAlertNotifications(publicKey: string | null, onOpen: (notification?: AlertNotification) => void, network = '') {
  const scope = `${publicKey ?? ''}:${network}`
  const [state, setState] = useState<{ scope: string; notifications: AlertNotification[]; alerts: PriceAlert[]; config: AlertsConfig | null; signedIn: boolean; loading: boolean; error: string | null }>({ scope, notifications: [], alerts: [], config: null, signedIn: hasSession(scope), loading: false, error: null })
  const generation = useRef(0)
  const inFlight = useRef(false)
  const shown = useRef(new Set<string>())
  const onOpenRef = useRef(onOpen)
  useEffect(() => { onOpenRef.current = onOpen }, [onOpen])

  const refresh = useCallback(async () => {
    if (!publicKey) return
    if (!hasSession(scope)) {
      setState(s => ({ ...s, signedIn: false, notifications: [], alerts: [], config: null, loading: false }))
      return
    }
    if (inFlight.current) return
    const current = generation.current
    inFlight.current = true
    setState(s => ({ ...s, loading: true }))
    try {
      const [notifications, alerts, config] = await Promise.all([fetchNotifications(), fetchAlerts(), fetchAlertsConfig()])
      if (current !== generation.current) return
      setState({ scope, notifications, alerts, config, signedIn: true, loading: false, error: null })
      for (const n of notifications) {
        const key = `${scope}:${n.id}`
        if (!n.readAt && n.popup && !shown.current.has(key)) {
          if (showBrowserNotification('Terminal8 alert', n.message, `terminal8-${n.id}`, () => {
            if (current === generation.current) onOpenRef.current(n)
          })) shown.current.add(key)
        }
      }
    } catch (e) {
      if (current !== generation.current) return
      setState(s => e instanceof AlertsAuthError
        ? { ...s, signedIn: false, notifications: [], alerts: [], config: null, loading: false, error: null }
        : { ...s, loading: false, error: e instanceof Error ? e.message : 'Unable to load notifications' })
    } finally { if (current === generation.current) inFlight.current = false }
  }, [publicKey, scope])

  useEffect(() => {
    generation.current++
    inFlight.current = false
    const initial = setTimeout(() => {
      setState({ scope, notifications: [], alerts: [], config: null, signedIn: hasSession(scope), loading: false, error: null })
      void refresh()
    }, 0)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 30_000)
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', visible)
    return () => { generation.current++; clearTimeout(initial); clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [scope, refresh])

  const signIn = async () => {
    if (!publicKey) return
    const current = generation.current
    const token = await loginWithFreighterFlow(publicKey, (xdr, opts) => StellarWalletsKit.signTransaction(xdr, { networkPassphrase: opts.networkPassphrase, address: opts.accountToSign }))
    if (current !== generation.current) return
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ scope, token }))
    setState(s => ({ ...s, signedIn: true }))
    await refresh()
  }
  const markRead = async (ids?: number[]) => {
    // Invalidate a poll started before the user's read action.
    generation.current++
    inFlight.current = false
    const current = generation.current
    await markNotificationsRead(ids)
    if (current !== generation.current) return
    setState(s => ({ ...s, notifications: s.notifications.map(n => !ids || ids.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n) }))
    await refresh()
  }
  const visible = state.scope === scope && !!publicKey ? state : { ...state, notifications: [], alerts: [], config: null, signedIn: false, error: null, loading: false }
  return { ...visible, unreadCount: visible.notifications.filter(n => !n.readAt).length, refresh, signIn, markRead }
}

export type AlertsModel = ReturnType<typeof useAlertNotifications>
