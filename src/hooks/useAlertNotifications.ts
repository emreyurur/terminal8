import { useCallback, useEffect, useRef, useState } from 'react'
import { showBrowserNotification } from '../lib/browserNotifications'
import { AlertsAuthError, fetchNotifications, markNotificationsRead, type AlertNotification } from '../services/alertsApi'

const POLL_MS = 30_000

/**
 * Checks for fired alerts while the app is open and raises browser notifications for them.
 * It never asks for a wallet signature: without a session it just stays quiet.
 * Alerts that could not be shown as a system notification stay unread so the Alerts page still lists them.
 */
export function useAlertNotifications(publicKey: string | null, onOpen: () => void) {
  const [unread, setUnread] = useState<AlertNotification[]>([])
  const shown = useRef(new Set<number>())
  const onOpenRef = useRef(onOpen)

  useEffect(() => {
    onOpenRef.current = onOpen
  }, [onOpen])

  const poll = useCallback(async () => {
    if (!publicKey) return
    try {
      const list = await fetchNotifications(true)
      const fresh = list.filter((n) => n.popup && !shown.current.has(n.id))
      const delivered: number[] = []
      for (const n of fresh) {
        const ok = showBrowserNotification('Terminal8 alert', n.message, `terminal8-alert-${n.id}`, () => onOpenRef.current())
        if (ok) {
          shown.current.add(n.id)
          delivered.push(n.id)
        }
      }
      if (delivered.length > 0) await markNotificationsRead(delivered)
      setUnread(delivered.length > 0 ? list.filter((n) => !delivered.includes(n.id)) : list)
    } catch (e) {
      if (e instanceof AlertsAuthError) setUnread([])
      /* network hiccups: try again on the next tick */
    }
  }, [publicKey])

  useEffect(() => {
    if (!publicKey) return
    const first = setTimeout(() => void poll(), 0)
    const timer = setInterval(() => void poll(), POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [publicKey, poll])

  return { unreadCount: unread.length, refresh: poll }
}
