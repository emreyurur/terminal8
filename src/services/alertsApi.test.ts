import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AlertsAuthError,
  createAlert,
  deleteAlert,
  fetchAlerts,
  fetchAlertsConfig,
  fetchCurrentValue,
  fetchNotifications,
  markNotificationsRead,
  updateAlert,
  type CreateAlertInput,
} from './alertsApi'

const tokenKey = 'terminal8_jwt_token'

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response
}

describe('alerts API', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    localStorage.setItem(tokenKey, 'jwt-token')
    fetchMock.mockReset().mockResolvedValue(response({}))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('uses the documented config, list, and current-value endpoints', async () => {
    await fetchAlertsConfig()
    await fetchAlerts()
    await fetchCurrentValue('a'.repeat(64), 'PRICE', 'B')

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/alerts\/config$/)
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/v1\/alerts$/)
    const currentUrl = new URL(fetchMock.mock.calls[2][0])
    expect(currentUrl.pathname).toMatch(/\/api\/v1\/alerts\/current$/)
    expect(Object.fromEntries(currentUrl.searchParams)).toEqual({
      poolId: 'a'.repeat(64),
      metric: 'PRICE',
      quoteSide: 'B',
    })
  })

  it('always sends the required unread query parameter', async () => {
    await fetchNotifications()
    await fetchNotifications(true)

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('unread')).toBe('false')
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('unread')).toBe('true')
  })

  it('sends create, update, delete, and mark-read requests with the documented methods and bodies', async () => {
    const input: CreateAlertInput = {
      poolId: 'b'.repeat(64),
      metric: 'POSITION_VALUE',
      condition: 'ABOVE',
      threshold: 100,
      quoteSide: 'A',
      notifyBrowser: true,
      notifyEmail: false,
    }

    await createAlert(input)
    await updateAlert('alert/id', { status: 'PAUSED', threshold: 120 })
    await deleteAlert('alert/id')
    await markNotificationsRead([4, 9])
    await markNotificationsRead()

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(input) })
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/alerts\/alert%2Fid$/)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ status: 'PAUSED', threshold: 120 }) })
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'DELETE' })
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ ids: [4, 9] }) })
    expect(fetchMock.mock.calls[4][1]).toMatchObject({ method: 'POST', body: '{}' })
  })

  it('adds bearer authorization and clears an invalid session on 401', async () => {
    fetchMock.mockResolvedValueOnce(response({ message: 'Unauthorized' }, 401))

    await expect(fetchAlertsConfig()).rejects.toBeInstanceOf(AlertsAuthError)
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer jwt-token',
    })
    expect(localStorage.getItem(tokenKey)).toBeNull()
  })

  it('does not call the API without an authenticated wallet session', async () => {
    localStorage.removeItem(tokenKey)

    await expect(fetchAlerts()).rejects.toBeInstanceOf(AlertsAuthError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
