import { API_BASE, clearStoredJwtToken, getStoredJwtToken } from './terminal8Api'
import type { AlertCondition, AlertMetric, QuoteSide } from '../lib/alerts'

export type AlertStatus = 'ACTIVE' | 'TRIGGERED' | 'PAUSED'

export type PriceAlert = {
  id: string
  poolId: string
  codeA: string
  codeB: string
  metric: AlertMetric
  condition: AlertCondition
  threshold: number
  quoteSide: QuoteSide
  notifyBrowser: boolean
  notifyEmail: boolean
  email: string | null
  status: AlertStatus
  lastValue: number | null
  lastCheckedAt: string | null
  triggeredAt: string | null
  triggeredValue: number | null
  emailStatus: 'SENT' | 'FAILED' | null
  createdAt: string
}

export type AlertNotification = {
  id: number
  alertId: string
  message: string
  value: number
  popup: boolean
  createdAt: string
  readAt: string | null
}

export type AlertsConfig = { emailEnabled: boolean; maxAlerts: number; checkIntervalMs: number }

export type CreateAlertInput = {
  poolId: string
  metric: AlertMetric
  condition: AlertCondition
  threshold: number
  quoteSide: QuoteSide
  notifyBrowser: boolean
  notifyEmail: boolean
  email?: string
}

export type UpdateAlertInput = Partial<
  Pick<CreateAlertInput, 'condition' | 'threshold' | 'quoteSide' | 'notifyBrowser' | 'notifyEmail' | 'email'>
> & { status?: 'ACTIVE' | 'PAUSED' }

/** Thrown when there is no valid session, so the UI can offer sign-in instead of an error. */
export class AlertsAuthError extends Error {
  constructor() {
    super('Sign in to manage alerts')
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const jwt = getStoredJwtToken()
  if (!jwt) throw new AlertsAuthError()

  const res = await fetch(`${API_BASE}api/v1/alerts${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${jwt}`,
      ...init.headers,
    },
  })
  if (res.status === 401) {
    if (getStoredJwtToken() === jwt) clearStoredJwtToken()
    throw new AlertsAuthError()
  }
  const text = await res.text()
  if (!res.ok) {
    let message = text
    try {
      const body = JSON.parse(text)
      message = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? text)
    } catch {
      /* keep raw text */
    }
    throw new Error(message || `Request failed (${res.status})`)
  }
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) })
const query = (values: Record<string, string | boolean>) => {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => params.set(key, String(value)))
  return params.toString()
}

export const fetchAlertsConfig = () => request<AlertsConfig>('/config')
export const fetchAlerts = () => request<PriceAlert[]>('')
export const createAlert = (input: CreateAlertInput) => request<PriceAlert>('', { method: 'POST', ...json(input) })
export const updateAlert = (id: string, input: UpdateAlertInput) =>
  request<PriceAlert>(`/${encodeURIComponent(id)}`, { method: 'PATCH', ...json(input) })
export const deleteAlert = (id: string) => request<{ deleted: boolean }>(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const fetchNotifications = (unreadOnly = false) =>
  request<AlertNotification[]>(`/notifications?${query({ unread: unreadOnly })}`)
export const markNotificationsRead = (ids?: number[]) =>
  request<{ updated: number }>('/notifications/read', { method: 'POST', ...json(ids ? { ids } : {}) })
export const fetchCurrentValue = (poolId: string, metric: AlertMetric, quoteSide: QuoteSide) =>
  request<{ value: number | null; codeA: string; codeB: string }>(
    `/current?${query({ poolId, metric, quoteSide })}`,
  )
