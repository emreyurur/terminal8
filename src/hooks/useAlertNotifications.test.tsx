import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AlertNotification } from '../services/alertsApi'

const fetchNotifications = vi.fn()
const markNotificationsRead = vi.fn()

vi.mock('../services/alertsApi', () => ({
  AlertsAuthError: class AlertsAuthError extends Error {},
  fetchNotifications: (...a: unknown[]) => fetchNotifications(...a),
  markNotificationsRead: (...a: unknown[]) => markNotificationsRead(...a),
  fetchAlerts: async () => [],
  fetchAlertsConfig: async () => ({ emailEnabled: true, maxAlerts: 20, checkIntervalMs: 30000 }),
}))

vi.mock('@creit.tech/stellar-wallets-kit', () => ({ StellarWalletsKit: { signTransaction: vi.fn() } }))
vi.mock('../services/terminal8Api', () => ({ getStoredJwtToken: () => 'test-token', loginWithFreighterFlow: vi.fn() }))

import { useAlertNotifications } from './useAlertNotifications'

const note = (id: number, popup = true): AlertNotification => ({
  id,
  alertId: 'a',
  message: `alert ${id}`,
  value: 1,
  popup,
  createdAt: '',
  readAt: null,
})

const shownTitles: string[] = []
function stubNotification(permission: NotificationPermission) {
  class Fake {
    static permission = permission
    onclick: (() => void) | null = null
    constructor(title: string, opts: { body: string }) {
      shownTitles.push(`${title}: ${opts.body}`)
    }
    close() {}
  }
  vi.stubGlobal('Notification', Fake)
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  sessionStorage.setItem('terminal8_alert_session', JSON.stringify({ scope: 'GKEY:', token: 'test-token' }))
  shownTitles.length = 0
  fetchNotifications.mockReset()
  markNotificationsRead.mockReset().mockResolvedValue({ updated: 1 })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useAlertNotifications', () => {
  it('does nothing without a connected wallet', async () => {
    stubNotification('granted')
    renderHook(() => useAlertNotifications(null, () => {}))
    await flush()
    expect(fetchNotifications).not.toHaveBeenCalled()
  })

  it('shows each fired alert once without marking it read', async () => {
    stubNotification('granted')
    fetchNotifications.mockResolvedValue([note(1), note(2)])
    const { result } = renderHook(() => useAlertNotifications('GKEY', () => {}))
    await flush()

    expect(shownTitles).toEqual(['Terminal8 alert: alert 1', 'Terminal8 alert: alert 2'])
    expect(markNotificationsRead).not.toHaveBeenCalled()
    expect(result.current.unreadCount).toBe(2)

    // the next poll returns the same rows (server hasn't caught up): no repeat popups
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(shownTitles).toHaveLength(2)
  })

  it('keeps alerts unread when the browser will not show them', async () => {
    stubNotification('denied')
    fetchNotifications.mockResolvedValue([note(5)])
    const { result } = renderHook(() => useAlertNotifications('GKEY', () => {}))
    await flush()

    expect(shownTitles).toHaveLength(0)
    expect(markNotificationsRead).not.toHaveBeenCalled()
    expect(result.current.unreadCount).toBe(1)
  })

  it('skips alerts that opted out of the browser popup', async () => {
    stubNotification('granted')
    fetchNotifications.mockResolvedValue([note(9, false)])
    const { result } = renderHook(() => useAlertNotifications('GKEY', () => {}))
    await flush()

    expect(shownTitles).toHaveLength(0)
    expect(result.current.unreadCount).toBe(1)
  })

  it('polls again on the interval', async () => {
    stubNotification('granted')
    fetchNotifications.mockResolvedValue([])
    renderHook(() => useAlertNotifications('GKEY', () => {}))
    await flush()
    const first = fetchNotifications.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchNotifications.mock.calls.length).toBeGreaterThan(first)
  })

  it('clears the list immediately when the wallet disconnects', async () => {
    stubNotification('denied')
    fetchNotifications.mockResolvedValue([note(1)])
    const { result, rerender } = renderHook(({ key }) => useAlertNotifications(key, () => {}), { initialProps: { key: 'GKEY' as string | null } })
    await flush()
    expect(result.current.unreadCount).toBe(1)
    rerender({ key: null })
    expect(result.current.notifications).toEqual([])
    expect(result.current.signedIn).toBe(false)
  })

  it('ignores an old response after the wallet changes', async () => {
    stubNotification('denied')
    let resolve!: (notes: AlertNotification[]) => void
    fetchNotifications.mockReturnValue(new Promise<AlertNotification[]>(r => { resolve = r }))
    const { result, rerender } = renderHook(({ key }) => useAlertNotifications(key, () => {}), { initialProps: { key: 'GKEY' } })
    await flush()
    rerender({ key: 'OTHER' })
    await flush()
    await act(async () => { resolve([note(1)]) })
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.signedIn).toBe(false)
  })

  it('marks only selected notifications as read', async () => {
    stubNotification('denied')
    fetchNotifications.mockResolvedValue([note(1), note(2)])
    const { result } = renderHook(() => useAlertNotifications('GKEY', () => {}))
    await flush()
    fetchNotifications.mockResolvedValue([{ ...note(1), readAt: '2026-01-01' }, note(2)])
    await act(async () => { await result.current.markRead([1]) })
    expect(markNotificationsRead).toHaveBeenCalledWith([1])
    expect(result.current.unreadCount).toBe(1)
  })
})
