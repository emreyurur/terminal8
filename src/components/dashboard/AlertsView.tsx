import { useCallback, useEffect, useMemo, useState } from 'react'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { useWallet } from '../../context/useWallet'
import { usePools } from '../../hooks/usePools'
import {
  METRIC_OPTIONS,
  alertSummary,
  allowedConditions,
  formatAlertValue,
  formatNumber,
  isValidEmail,
  isValidPoolId,
  quoteAsset,
  type AlertCondition,
  type AlertMetric,
  type QuoteSide,
} from '../../lib/alerts'
import {
  notificationPermission,
  requestNotificationPermission,
  showBrowserNotification,
  type PermissionState,
} from '../../lib/browserNotifications'
import type { SignFn } from '../../services/rampApi'
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
  type AlertNotification,
  type AlertsConfig,
  type PriceAlert,
} from '../../services/alertsApi'
import { getStoredJwtToken, loginWithFreighterFlow } from '../../services/terminal8Api'
import type { LocalPosition } from '../../types/stellar'

const card = 'rounded-2xl border border-white/10 bg-[#12121A] p-6 shadow-xl'
const input =
  'w-full rounded-xl border border-white/10 bg-[#0A0A0E] px-3 py-2 text-sm text-[#F0F0F0] outline-none focus:border-[#F2C12E] disabled:opacity-50'
const button =
  'rounded-xl bg-[#F2C12E] px-4 py-2 text-sm font-semibold text-[#0A0A0E] transition hover:bg-[#F2C12E]/90 disabled:opacity-50'
const ghost =
  'rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-[#9CA3AF] transition hover:border-[#F2C12E] hover:text-[#F2C12E] disabled:opacity-50'
const label = 'mb-1 block text-xs font-medium text-[#9CA3AF]'

const STATUS_STYLE: Record<PriceAlert['status'], string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-300',
  TRIGGERED: 'bg-[#F2C12E]/15 text-[#F2C12E]',
  PAUSED: 'bg-white/10 text-[#9CA3AF]',
}

const sign: SignFn = (xdr, opts) =>
  StellarWalletsKit.signTransaction(xdr, { networkPassphrase: opts.networkPassphrase, address: opts.accountToSign })

const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return String(e)
}

type Props = { positions: LocalPosition[]; onSessionChange?: () => void }

export function AlertsView({ positions, onSessionChange }: Props) {
  const { publicKey, status } = useWallet()
  const connected = status === 'CONNECTED' && !!publicKey
  const poolsState = usePools(publicKey)

  const [signedIn, setSignedIn] = useState(() => !!getStoredJwtToken())
  const [config, setConfig] = useState<AlertsConfig | null>(null)
  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [notifications, setNotifications] = useState<AlertNotification[]>([])
  const [permission, setPermission] = useState<PermissionState>(() => notificationPermission())
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // create form
  const [poolChoice, setPoolChoice] = useState('')
  const [customPool, setCustomPool] = useState('')
  const [metric, setMetric] = useState<AlertMetric>('PRICE')
  const [condition, setCondition] = useState<AlertCondition>('ABOVE')
  const [quoteSide, setQuoteSide] = useState<QuoteSide>('A')
  const [threshold, setThreshold] = useState('')
  const [notifyBrowser, setNotifyBrowser] = useState(true)
  const [notifyEmail, setNotifyEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [current, setCurrent] = useState<{ key: string; value: number | null; codeA: string; codeB: string } | null>(null)
  const [currentError, setCurrentError] = useState<{ key: string; message: string } | null>(null)

  const poolId = (customPool.trim() || poolChoice).toLowerCase()
  const poolIdValid = isValidPoolId(poolId)
  const currentKey = `${poolId}|${metric}|${quoteSide}`

  const poolOptions = useMemo(() => {
    const pools = poolsState.status === 'success' ? poolsState.pools : []
    const byId = new Map(pools.map((p) => [p.id, p]))
    const name = (id: string) => {
      const p = byId.get(id)
      return p ? `${p.asset}/${p.secondaryAsset ?? '?'}` : `Pool ${id.slice(0, 8)}…`
    }
    const mine = [...new Set(positions.map((p) => p.poolId).filter(isValidPoolId))]
    const rest = pools.filter((p) => p.category === 'AMM LP' && isValidPoolId(p.id) && !mine.includes(p.id))
    return {
      mine: mine.map((id) => ({ id, label: name(id) })),
      top: rest.map((p) => ({ id: p.id, label: `${p.asset}/${p.secondaryAsset ?? '?'} · ${p.tvl}` })),
    }
  }, [poolsState, positions])

  const handleAuthError = useCallback((e: unknown) => {
    if (e instanceof AlertsAuthError) {
      setSignedIn(false)
      return true
    }
    return false
  }, [])

  const reload = useCallback(async () => {
    try {
      const [a, n, c] = await Promise.all([fetchAlerts(), fetchNotifications(false), fetchAlertsConfig()])
      setAlerts(a)
      setNotifications(n)
      setConfig(c)
    } catch (e) {
      if (!handleAuthError(e)) setMessage(errMsg(e))
    }
  }, [handleAuthError])

  useEffect(() => {
    if (!signedIn) return
    const t = setTimeout(() => void reload(), 0)
    // keep the list fresh while the page is open: alerts fire on the server
    const timer = setInterval(() => void reload(), 30_000)
    return () => {
      clearTimeout(t)
      clearInterval(timer)
    }
  }, [signedIn, reload])

  // Current value next to the threshold field, and the asset codes for the quote picker.
  useEffect(() => {
    if (!signedIn || !poolIdValid) return
    let cancelled = false
    fetchCurrentValue(poolId, metric, quoteSide)
      .then((r) => !cancelled && setCurrent({ key: currentKey, ...r }))
      .catch((e) => {
        if (cancelled || handleAuthError(e)) return
        setCurrentError({ key: currentKey, message: errMsg(e) })
      })
    return () => {
      cancelled = true
    }
  }, [signedIn, poolIdValid, poolId, metric, quoteSide, currentKey, handleAuthError])

  const currentNow = current?.key === currentKey ? current : null
  const currentErr = currentError?.key === currentKey ? currentError.message : null
  const codes = current && current.key.startsWith(`${poolId}|`) ? { a: current.codeA, b: current.codeB } : null

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    setMessage(null)
    try {
      await fn()
    } catch (e) {
      if (!handleAuthError(e)) setMessage(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const signIn = () =>
    run('signin', async () => {
      if (!publicKey) throw new Error('Connect your wallet first')
      await loginWithFreighterFlow(publicKey, sign)
      setSignedIn(true)
      onSessionChange?.()
    })

  const enableBrowser = async () => {
    const result = await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') {
      showBrowserNotification('Terminal8 alerts are on', 'You will be notified here when an alert fires.', 'terminal8-test')
    }
    return result
  }

  const create = () =>
    run('create', async () => {
      const value = Number(threshold)
      if (!poolIdValid) throw new Error('Pick a pool or paste a valid pool ID')
      if (!Number.isFinite(value) || threshold.trim() === '') throw new Error('Enter a threshold value')
      if (notifyEmail && !isValidEmail(email)) throw new Error('Enter a valid email address')
      if (notifyBrowser && permission === 'default') await enableBrowser()

      await createAlert({
        poolId,
        metric,
        condition,
        threshold: value,
        quoteSide,
        notifyBrowser,
        notifyEmail,
        email: notifyEmail ? email.trim() : undefined,
      })
      setThreshold('')
      await reload()
    })

  const act = (name: string, fn: () => Promise<unknown>) =>
    run(name, async () => {
      await fn()
      await reload()
    })

  const clearRead = () => act('read', () => markNotificationsRead())

  const unreadCount = notifications.filter((n) => !n.readAt).length
  const conditions = allowedConditions(metric)
  const effectiveCondition = conditions.includes(condition) ? condition : conditions[0]
  const emailUnavailable = config !== null && !config.emailEnabled
  const showQuote = metric !== 'IMPERMANENT_LOSS_PCT'

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-[#F0F0F0]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#F2C12E]">Price alerts</h1>
        <p className="text-sm text-[#9CA3AF]">
          Get notified when a pool or your position crosses a value. Each alert fires once, then pauses until you re-arm it.
        </p>
      </div>

      {message && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm break-words text-red-300">{message}</div>}

      {!connected ? (
        <div className={card}>
          <p className="text-sm text-[#9CA3AF]">Connect your wallet from the header to manage alerts.</p>
        </div>
      ) : !signedIn ? (
        <div className={card}>
          <h2 className="text-lg font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-[#9CA3AF]">Alerts are tied to your wallet. Sign one message to continue, no fee involved.</p>
          <button className={`${button} mt-4`} disabled={busy !== null} onClick={signIn} type="button">
            {busy === 'signin' ? 'Waiting for wallet…' : 'Sign in with wallet'}
          </button>
        </div>
      ) : (
        <>
          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">New alert</h2>
              {permission !== 'granted' && permission !== 'unsupported' && (
                <button className={ghost} onClick={enableBrowser} type="button">
                  {permission === 'denied' ? 'Notifications blocked in browser settings' : 'Enable browser notifications'}
                </button>
              )}
              {permission === 'granted' && (
                <button
                  className={ghost}
                  onClick={() => showBrowserNotification('Terminal8 test', 'Browser notifications work.', 'terminal8-test')}
                  type="button"
                >
                  Send test notification
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="alert-pool">Pool</label>
                <select
                  className={input}
                  id="alert-pool"
                  onChange={(e) => {
                    setPoolChoice(e.target.value)
                    setCustomPool('')
                  }}
                  value={customPool ? '' : poolChoice}
                >
                  <option value="">Select a pool…</option>
                  {poolOptions.mine.length > 0 && (
                    <optgroup label="Your positions">
                      {poolOptions.mine.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Pools">
                    {poolOptions.top.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </optgroup>
                </select>
                <input
                  aria-label="Or paste a pool ID"
                  className={`${input} mt-2 font-mono text-xs`}
                  onChange={(e) => setCustomPool(e.target.value)}
                  placeholder="…or paste a pool ID (64 characters)"
                  value={customPool}
                />
                {customPool.trim() !== '' && !isValidPoolId(customPool) && (
                  <p className="mt-1 text-xs text-red-300">A pool ID is 64 hex characters.</p>
                )}
              </div>

              <div>
                <label className={label} htmlFor="alert-metric">Watch</label>
                <select
                  className={input}
                  id="alert-metric"
                  onChange={(e) => {
                    const next = e.target.value as AlertMetric
                    setMetric(next)
                    if (!allowedConditions(next).includes(condition)) setCondition('ABOVE')
                  }}
                  value={metric}
                >
                  {METRIC_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>

              <div>
                <label className={label} htmlFor="alert-condition">When it goes</label>
                <select
                  className={input}
                  id="alert-condition"
                  onChange={(e) => setCondition(e.target.value as AlertCondition)}
                  value={effectiveCondition}
                >
                  {conditions.includes('ABOVE') && <option value="ABOVE">Above (≥)</option>}
                  {conditions.includes('BELOW') && <option value="BELOW">Below (≤)</option>}
                </select>
              </div>

              {showQuote && (
                <div>
                  <label className={label} htmlFor="alert-quote">Measured in</label>
                  <select className={input} disabled={!codes} id="alert-quote" onChange={(e) => setQuoteSide(e.target.value as QuoteSide)} value={quoteSide}>
                    <option value="A">{codes ? codes.a : 'First asset'}</option>
                    <option value="B">{codes ? codes.b : 'Second asset'}</option>
                  </select>
                </div>
              )}

              <div>
                <label className={label} htmlFor="alert-threshold">
                  Threshold{metric === 'IMPERMANENT_LOSS_PCT' ? ' (%)' : codes ? ` (${quoteAsset({ quoteSide, codeA: codes.a, codeB: codes.b })})` : ''}
                </label>
                <input className={input} id="alert-threshold" min={0} onChange={(e) => setThreshold(e.target.value)} placeholder="0.00" step="any" type="number" value={threshold} />
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  {currentErr
                    ? currentErr
                    : currentNow
                      ? currentNow.value === null
                        ? metric === 'PRICE'
                          ? 'Pool has no liquidity yet.'
                          : 'No open position in this pool, so there is no current value to compare.'
                        : `Now: ${metric === 'IMPERMANENT_LOSS_PCT' ? `${formatNumber(currentNow.value)}%` : `${formatNumber(currentNow.value)} ${quoteSide === 'A' ? currentNow.codeA : currentNow.codeB}`}`
                      : poolIdValid ? 'Checking current value…' : ' '}
                </p>
              </div>
            </div>

            <fieldset className="mt-5 space-y-3">
              <legend className="mb-1 text-xs font-medium text-[#9CA3AF]">Notify me</legend>
              <label className="flex items-center gap-2 text-sm">
                <input checked={notifyBrowser} onChange={(e) => setNotifyBrowser(e.target.checked)} type="checkbox" />
                Browser notification <span className="text-xs text-[#9CA3AF]">(while Terminal8 is open in a tab)</span>
              </label>
              <label className={`flex items-center gap-2 text-sm ${emailUnavailable ? 'opacity-50' : ''}`}>
                <input checked={notifyEmail} disabled={emailUnavailable} onChange={(e) => setNotifyEmail(e.target.checked)} type="checkbox" />
                Email {emailUnavailable && <span className="text-xs text-[#9CA3AF]">(not set up on this server)</span>}
              </label>
              {notifyEmail && (
                <input aria-label="Email address" className={input} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" value={email} />
              )}
            </fieldset>

            <button className={`${button} mt-5`} disabled={busy !== null || !poolIdValid} onClick={create} type="button">
              {busy === 'create' ? 'Creating…' : 'Create alert'}
            </button>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold">
              Your alerts{config ? <span className="ml-2 text-xs font-normal text-[#9CA3AF]">{alerts.length}/{config.maxAlerts}</span> : null}
            </h2>
            {alerts.length === 0 ? (
              <p className="mt-3 text-sm text-[#9CA3AF]">No alerts yet. Create one above.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {alerts.map((a) => (
                  <AlertRow
                    alert={a}
                    busy={busy !== null}
                    key={a.id}
                    onDelete={() => act('delete', () => deleteAlert(a.id))}
                    onSetStatus={(status) => act('status', () => updateAlert(a.id, { status }))}
                    onThreshold={(value) => act('threshold', () => updateAlert(a.id, { threshold: value }))}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className={card}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Recent alerts{unreadCount > 0 && <span className="ml-2 rounded-full bg-[#F2C12E] px-2 py-0.5 text-xs font-bold text-[#0A0A0E]">{unreadCount} new</span>}
              </h2>
              {unreadCount > 0 && (
                <button className={ghost} disabled={busy !== null} onClick={clearRead} type="button">Mark all read</button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="mt-3 text-sm text-[#9CA3AF]">Nothing has fired yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-white/[0.06]">
                {notifications.map((n) => (
                  <li className="flex items-start justify-between gap-4 py-2 text-sm" key={n.id}>
                    <span className={n.readAt ? 'text-[#9CA3AF]' : 'font-semibold text-white'}>{n.message}</span>
                    <span className="shrink-0 text-xs text-[#9CA3AF]">{new Date(n.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AlertRow({
  alert: a,
  busy,
  onDelete,
  onSetStatus,
  onThreshold,
}: {
  alert: PriceAlert
  busy: boolean
  onDelete: () => void
  onSetStatus: (status: 'ACTIVE' | 'PAUSED') => void
  onThreshold: (value: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(a.threshold))

  return (
    <li className="rounded-xl border border-white/[0.08] bg-[#0A0A0E] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {a.codeA}/{a.codeB} <span className="font-normal text-[#9CA3AF]">· {alertSummary(a)}</span>
          </p>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            Last value {formatAlertValue(a, a.lastValue)}
            {a.lastCheckedAt ? ` · checked ${new Date(a.lastCheckedAt).toLocaleTimeString()}` : ''}
          </p>
          {a.status === 'TRIGGERED' && a.triggeredAt && (
            <p className="mt-1 text-xs text-[#F2C12E]">
              Fired {new Date(a.triggeredAt).toLocaleString()} at {formatAlertValue(a, a.triggeredValue)}
              {a.notifyEmail && a.emailStatus ? ` · email ${a.emailStatus === 'SENT' ? 'sent' : 'failed'}` : ''}
            </p>
          )}
          <p className="mt-1 text-xs text-[#9CA3AF]">
            {[a.notifyBrowser && 'Browser', a.notifyEmail && `Email (${a.email})`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[a.status]}`}>{a.status}</span>
      </div>

      {editing && (
        <div className="mt-3 flex gap-2">
          <input aria-label="New threshold" className={input} onChange={(e) => setValue(e.target.value)} step="any" type="number" value={value} />
          <button
            className={button}
            disabled={busy || !Number.isFinite(Number(value)) || value.trim() === ''}
            onClick={() => {
              onThreshold(Number(value))
              setEditing(false)
            }}
            type="button"
          >
            Save
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {a.status === 'TRIGGERED' && <button className={ghost} disabled={busy} onClick={() => onSetStatus('ACTIVE')} type="button">Re-arm</button>}
        {a.status === 'ACTIVE' && <button className={ghost} disabled={busy} onClick={() => onSetStatus('PAUSED')} type="button">Pause</button>}
        {a.status === 'PAUSED' && <button className={ghost} disabled={busy} onClick={() => onSetStatus('ACTIVE')} type="button">Resume</button>}
        <button className={ghost} disabled={busy} onClick={() => setEditing((v) => !v)} type="button">{editing ? 'Cancel' : 'Edit value'}</button>
        <button className={`${ghost} hover:border-red-400 hover:text-red-300`} disabled={busy} onClick={onDelete} type="button">Delete</button>
      </div>
    </li>
  )
}
