import { useEffect, useMemo, useState } from 'react'
import { usePools } from '../../hooks/usePools'
import { useWallet } from '../../context/useWallet'
import { METRIC_OPTIONS, allowedConditions, formatNumber, isValidEmail, isValidPoolId, type AlertMetric } from '../../lib/alerts'
import { createAlert, fetchCurrentValue, updateAlert, type CreateAlertInput, type PriceAlert } from '../../services/alertsApi'
import type { LocalPosition } from '../../types/stellar'
import { notificationPermission, requestNotificationPermission } from '../../lib/browserNotifications'

const field = 'mt-2 w-full min-w-0 rounded-lg border border-white/15 bg-[#0A0A0E] px-3 py-2.5 text-sm text-white outline-none focus:border-[#F2C12E] disabled:opacity-50'
const label = 'block text-xs font-medium text-zinc-400'

export function AlertForm({ alert, positions, emailEnabled, onSaved, onDirty, onPending }: {
  alert?: PriceAlert; positions: LocalPosition[]; emailEnabled: boolean
  onSaved: () => Promise<void>; onDirty: (dirty: boolean) => void
  onPending: (pending: boolean) => void
}) {
  const { publicKey } = useWallet()
  const pools = usePools(publicKey)
  const [draft, setDraft] = useState<CreateAlertInput>(() => alert ? {
    poolId: alert.poolId, metric: alert.metric, condition: alert.condition, quoteSide: alert.quoteSide,
    threshold: alert.threshold, notifyBrowser: alert.notifyBrowser, notifyEmail: alert.notifyEmail, email: alert.email ?? '',
  } : { poolId: '', metric: 'PRICE', condition: 'ABOVE', quoteSide: 'A', threshold: 0, notifyBrowser: false, notifyEmail: false, email: '' })
  const [threshold, setThreshold] = useState(alert ? String(alert.threshold) : '')
  const [manual, setManual] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [permission, setPermission] = useState(notificationPermission)
  const [current, setCurrent] = useState<{ key: string; value: number | null; codeA: string; codeB: string } | null>(null)
  const [currentError, setCurrentError] = useState<{ key: string; message: string } | null>(null)
  const key = `${draft.poolId}:${draft.metric}:${draft.quoteSide}`
  const change = (values: Partial<CreateAlertInput>) => { setDraft(d => ({ ...d, ...values })); onDirty(true) }
  const poolOptions = useMemo(() => {
    const available = pools.status === 'success' ? pools.pools.filter(p => p.category === 'AMM LP') : []
    const ids = [...new Set([...positions.map(p => p.poolId), ...available.map(p => p.id), ...(alert ? [alert.poolId] : [])])].filter(isValidPoolId)
    return ids.map(id => {
      const pool = available.find(p => p.id === id)
      return { id, mine: positions.some(p => p.poolId === id), name: pool ? `${pool.asset}/${pool.secondaryAsset ?? '?'}` : alert?.poolId === id ? `${alert.codeA}/${alert.codeB}` : `Pool ${id.slice(0, 8)}...` }
    })
  }, [pools, positions, alert])
  useEffect(() => {
    if (!isValidPoolId(draft.poolId)) return
    let cancelled = false
    fetchCurrentValue(draft.poolId, draft.metric, draft.quoteSide)
      .then(value => { if (!cancelled) { setCurrent({ key, ...value }); setCurrentError(null) } })
      .catch(e => { if (!cancelled) setCurrentError({ key, message: e instanceof Error ? e.message : 'Unable to fetch current value' }) })
    return () => { cancelled = true }
  }, [draft.poolId, draft.metric, draft.quoteSide, key])
  const now = current?.key === key ? current : null
  const codes = current?.key.startsWith(draft.poolId + ':') ? current : alert
  const poolError = !isValidPoolId(draft.poolId) ? 'Select a pool or enter its 64-character hex ID.' : ''
  const thresholdError = threshold.trim() === '' || !Number.isFinite(Number(threshold)) || Number(threshold) < 0 ? 'Enter a valid, non-negative threshold.' : ''
  const emailError = draft.notifyEmail && !isValidEmail(draft.email ?? '') ? 'Enter a valid email address.' : ''

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    if (poolError || thresholdError || emailError || (draft.notifyEmail && !emailEnabled)) return
    setBusy(true); onPending(true); setError('')
    try {
      const values = { ...draft, threshold: Number(threshold), condition: allowedConditions(draft.metric).includes(draft.condition) ? draft.condition : 'ABOVE' as const, email: draft.notifyEmail ? draft.email?.trim() : undefined }
      if (alert) {
        const { poolId: _pool, metric: _metric, ...updates } = values
        void _pool; void _metric
        await updateAlert(alert.id, updates)
      } else await createAlert(values)
      onDirty(false)
      await onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save alert') }
    finally { setBusy(false); onPending(false) }
  }

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      {error && <p role="alert" className="rounded-lg bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
      <label className={label}>Pool
        <select className={field} disabled={!!alert || manual} value={manual ? '' : draft.poolId} onChange={e => change({ poolId: e.target.value })}>
          <option value="">Select a pool</option>
          <optgroup label="Your positions">{poolOptions.filter(p => p.mine).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
          <optgroup label="Pools">{poolOptions.filter(p => !p.mine).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        </select>
      </label>
      {!alert && <div>
        <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} /> Enter pool ID manually</label>
        {manual && <input aria-label="Pool ID" className={field + ' font-mono'} value={draft.poolId} onChange={e => change({ poolId: e.target.value.trim().toLowerCase() })} placeholder="64-character pool ID" />}
      </div>}
      {attempted && poolError && <p role="alert" className="text-xs text-red-300">{poolError}</p>}
      <label className={label}>Watch
        <select className={field} disabled={!!alert} value={draft.metric} onChange={e => change({ metric: e.target.value as AlertMetric, condition: 'ABOVE' })}>
          {METRIC_OPTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>Condition
          <select className={field} value={draft.condition} onChange={e => change({ condition: e.target.value as 'ABOVE' | 'BELOW' })}>
            {allowedConditions(draft.metric).map(c => <option key={c} value={c}>{c === 'ABOVE' ? 'At or above' : 'At or below'}</option>)}
          </select>
        </label>
        {draft.metric !== 'IMPERMANENT_LOSS_PCT' && <label className={label}>Measured in
          <select className={field} value={draft.quoteSide} onChange={e => change({ quoteSide: e.target.value as 'A' | 'B' })}>
            <option value="A">{codes?.codeA ?? 'First asset'}</option><option value="B">{codes?.codeB ?? 'Second asset'}</option>
          </select>
        </label>}
      </div>
      <label className={label}>Threshold {draft.metric === 'IMPERMANENT_LOSS_PCT' ? '(%)' : codes ? `(${draft.quoteSide === 'A' ? codes.codeA : codes.codeB})` : ''}
        <input className={field} inputMode="decimal" type="number" min="0" step="any" value={threshold} onChange={e => { setThreshold(e.target.value); onDirty(true) }} placeholder="0.00" aria-invalid={attempted && !!thresholdError} />
      </label>
      {attempted && thresholdError && <p role="alert" className="text-xs text-red-300">{thresholdError}</p>}
      <p className="text-xs text-zinc-400" aria-live="polite">{currentError?.key === key ? currentError.message : now ? now.value === null ? 'No current value available.' : `Current value: ${formatNumber(now.value)} ${draft.metric === 'IMPERMANENT_LOSS_PCT' ? '%' : draft.quoteSide === 'A' ? now.codeA : now.codeB}` : isValidPoolId(draft.poolId) ? 'Checking current value...' : ''}</p>
      <fieldset className="space-y-4 border-t border-white/10 pt-5">
        <legend className="text-xs font-medium text-zinc-400">Delivery</legend>
        <p className="text-sm text-zinc-300">In-app inbox <span className="float-right text-xs text-emerald-400">Always on</span></p>
        <label className="flex items-center justify-between gap-3 text-sm">Browser notification
          <input type="checkbox" role="switch" checked={draft.notifyBrowser} disabled={permission === 'denied' || permission === 'unsupported'} onChange={async e => {
            if (!e.target.checked) { change({ notifyBrowser: false }); return }
            try { const result = await requestNotificationPermission(); setPermission(result); change({ notifyBrowser: result === 'granted' }) }
            catch { setError('Unable to enable browser notifications') }
          }} />
        </label>
        <p className="text-xs text-zinc-500">{permission === 'denied' ? 'Blocked in browser settings.' : permission === 'unsupported' ? 'Not supported by this browser.' : 'Delivered while Terminal8 is open.'}</p>
        <label className="flex items-center justify-between gap-3 text-sm">Email
          <input type="checkbox" role="switch" checked={draft.notifyEmail} disabled={!emailEnabled && !draft.notifyEmail} onChange={e => change({ notifyEmail: e.target.checked })} />
        </label>
        {!emailEnabled && <p className="text-xs text-zinc-500">Email delivery is currently unavailable.</p>}
        {draft.notifyEmail && <label className={label}>Email address<input className={field} type="email" value={draft.email ?? ''} onChange={e => change({ email: e.target.value })} placeholder="you@example.com" /></label>}
        {attempted && emailError && <p role="alert" className="text-xs text-red-300">{emailError}</p>}
      </fieldset>
      <div className="sticky bottom-0 border-t border-white/10 bg-[#0F141C] py-4">
        <button className="w-full rounded-lg bg-[#F2C12E] px-4 py-3 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50" disabled={busy || (draft.notifyEmail && !emailEnabled)} type="submit">{busy ? 'Saving...' : alert ? 'Save changes' : 'Create alert'}</button>
      </div>
    </form>
  )
}
