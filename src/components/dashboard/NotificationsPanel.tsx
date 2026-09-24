import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, Bell, Check, CheckCheck, ChevronRight, Copy, Inbox, LoaderCircle, MoreHorizontal, Pause, Play, Plus, RefreshCw, Settings2, X } from 'lucide-react'
import { useWallet } from '../../context/useWallet'
import xlmLogo from '../../assets/xlm.svg'
import type { AlertsModel } from '../../hooks/useAlertNotifications'
import { alertSummary, formatAlertValue } from '../../lib/alerts'
import { notificationPermission, requestNotificationPermission, showBrowserNotification } from '../../lib/browserNotifications'
import { deleteAlert, updateAlert, type AlertNotification, type PriceAlert } from '../../services/alertsApi'
import type { LocalPosition } from '../../types/stellar'
import { AlertForm } from './AlertForm'
import './notifications.css'

type View = 'inbox' | 'alerts' | 'create' | 'edit' | 'settings' | 'detail'
export function NotificationsPanel({ model, positions, initialNotification, onClose }: {
  model: AlertsModel; positions: LocalPosition[]; initialNotification?: AlertNotification; onClose: () => void
}) {
  const { publicKey, status, networkPassphrase, connect } = useWallet()
  const connected = status === 'CONNECTED' && !!publicKey
  const signIn = model.signIn
  const dialog = useRef<HTMLDialogElement>(null)
  const [view, setView] = useState<View>(initialNotification ? 'detail' : 'inbox')
  const [selected, setSelected] = useState<AlertNotification | undefined>(initialNotification)
  const [editing, setEditing] = useState<PriceAlert>()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState<{ action: () => void }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [permission, setPermission] = useState(notificationPermission)
  const [addressCopied, setAddressCopied] = useState(false)
  const initialRef = useRef(initialNotification)
  const autoSignInAttempted = useRef(false)
  const markReadRef = useRef(model.markRead)
  const refreshRef = useRef(model.refresh)
  useLayoutEffect(() => {
    const el = dialog.current!
    const previous = document.activeElement as HTMLElement | null
    const body = document.body
    const overflow = body.style.overflow
    const paddingRight = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const currentPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0
    if (scrollbarWidth > 0) body.style.paddingRight = `${currentPadding + scrollbarWidth}px`
    body.style.overflow = 'hidden'
    el.showModal()
    void refreshRef.current()
    const initial = initialRef.current
    if (initial && !initial.readAt) void markReadRef.current([initial.id]).catch(() => setError('Unable to mark notification as read'))
    return () => {
      el.close()
      body.style.overflow = overflow
      body.style.paddingRight = paddingRight
      previous?.focus()
    }
  }, [])
  useEffect(() => {
    const sync = () => setPermission(notificationPermission())
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [])
  useEffect(() => {
    if (!connected || model.signedIn || autoSignInAttempted.current) return
    autoSignInAttempted.current = true
    setBusy(true)
    setError('')
    void signIn()
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to authorize alerts'))
      .finally(() => setBusy(false))
  }, [connected, model.signedIn, signIn])
  const navigate = (action: () => void) => {
    if (busy) return
    if (dirty) setPending({ action })
    else { setError(''); action() }
  }
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }
  const mutate = (action: () => Promise<unknown>) => run(async () => { await action(); await model.refresh() })
  const items = model.notifications.filter(n => !unreadOnly || !n.readAt)
  const related = model.alerts.find(a => a.id === selected?.alertId)
  const root = view === 'inbox' || view === 'alerts'
  const formView = view === 'create' || view === 'edit'
  const title = view === 'settings' ? 'Notification settings' : view === 'create' ? 'Create alert' : view === 'edit' ? 'Edit alert' : view === 'detail' ? 'Alert details' : 'Notifications'
  const back = () => navigate(() => setView(view === 'create' || view === 'edit' ? 'alerts' : 'inbox'))
  const copyAddress = async () => {
    if (!publicKey) return
    try {
      await navigator.clipboard.writeText(publicKey)
      setAddressCopied(true)
      window.setTimeout(() => setAddressCopied(false), 1600)
    } catch {
      setError('Unable to copy wallet address')
    }
  }

  return (
    <dialog ref={dialog} className="notification-panel" aria-labelledby="notifications-title" onCancel={e => { e.preventDefault(); navigate(onClose) }} onClick={e => { if (e.target === e.currentTarget) navigate(onClose) }}>
      <div className="flex h-full min-h-0 flex-col" onClick={e => e.stopPropagation()}>
        <header className="shrink-0 border-b border-white/10 px-5 pb-4 pt-5">
          <div className="flex items-center gap-2">
            {!root && <button className="notification-icon" aria-label="Back" title="Back" onClick={back}><ArrowLeft size={18} /></button>}
            <h2 id="notifications-title" className="min-w-0 flex-1 text-lg font-semibold">{title}</h2>
            {root && <button className="notification-icon" aria-label="Notification settings" title="Notification settings" onClick={() => navigate(() => setView('settings'))}><Settings2 size={18} /></button>}
            <button className="notification-icon" aria-label="Close notifications" title="Close" onClick={() => navigate(onClose)}><X size={20} /></button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <img alt="" aria-hidden="true" className="size-4 shrink-0 rounded-full" src={xlmLogo} />
            <span>{networkPassphrase?.includes('Test') ? 'Stellar Testnet' : networkPassphrase?.includes('Public') ? 'Stellar Mainnet' : 'Stellar network'}</span>
            <span className="font-mono">{connected ? `${publicKey.slice(0, 5)}...${publicKey.slice(-5)}` : 'Wallet not connected'}</span>
            {connected && <button type="button" className="inline-flex size-6 items-center justify-center rounded text-zinc-500 transition hover:bg-white/[0.06] hover:text-white" aria-label={addressCopied ? 'Wallet address copied' : 'Copy wallet address'} title={addressCopied ? 'Copied' : 'Copy wallet address'} onClick={() => void copyAddress()}>{addressCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}</button>}
          </div>
        </header>
        {pending && <div role="alert" className="border-b border-yellow-400/20 bg-yellow-400/10 p-4 text-sm">
          <p>Discard unsaved changes?</p><div className="mt-3 flex gap-3">
            <button className="notification-command" onClick={() => setPending(undefined)}>Keep editing</button>
            <button className="notification-command text-red-300" onClick={() => { setDirty(false); setPending(undefined); pending.action() }}>Discard</button>
          </div>
        </div>}
        {root && <div className="flex shrink-0 border-b border-white/10 px-5" role="tablist" aria-label="Notifications">
          <button role="tab" id="inbox-tab" aria-controls="notification-content" aria-selected={view === 'inbox'} className="notification-tab" onClick={() => setView('inbox')}>Inbox {model.unreadCount > 0 && <span className="ml-2 text-xs text-[#F2C12E]">{model.unreadCount}</span>}</button>
          <button role="tab" id="alerts-tab" aria-controls="notification-content" aria-selected={view === 'alerts'} className="notification-tab" onClick={() => setView('alerts')}>My alerts <span className="ml-2 text-xs text-zinc-500">{model.alerts.length}</span></button>
        </div>}
        <div id="notification-content" role={root ? 'tabpanel' : undefined} aria-labelledby={root ? `${view === 'inbox' ? 'inbox' : 'alerts'}-tab` : undefined} className={`min-h-0 flex-1 overscroll-contain ${formView ? 'flex flex-col overflow-hidden' : 'overflow-y-auto px-5 py-5'}`}>
          {(error || model.error) && <div role="alert" className={`${formView ? 'mx-5 mt-5' : 'mb-4'} rounded-lg bg-red-400/10 p-3 text-sm text-red-300`}><p className="break-words">{error || model.error}</p><button className="mt-2 underline" onClick={() => void run(model.refresh)}>Retry</button></div>}
          {view === 'settings' ? <div className="space-y-6">
            <section className="space-y-3 border-b border-white/10 pb-6">
              <h3 className="text-sm font-medium">Browser notifications</h3>
              <p className="text-xs text-zinc-400">{permission === 'granted' ? 'Enabled on this browser' : permission === 'denied' ? 'Blocked. Change notification permissions in your browser settings.' : permission === 'unsupported' ? 'This browser does not support notifications.' : 'Not enabled'}</p>
              {permission === 'default' && <button className="notification-command" onClick={() => void run(async () => setPermission(await requestNotificationPermission()))}>Enable notifications</button>}
              {permission === 'granted' && <button className="notification-command" onClick={() => { if (!showBrowserNotification('Terminal8', 'Your notifications are ready.', 'terminal8-test')) setError('Unable to display a notification') }}>Send test notification</button>}
              <p className="text-xs text-zinc-500">Browser delivery requires an open Terminal8 tab.</p>
            </section>
            <section className="space-y-3"><h3 className="text-sm font-medium">Email delivery</h3><p className="text-xs text-zinc-400">{!model.signedIn ? 'Sign in to check availability.' : model.config?.emailEnabled ? 'Available. Email recipients are saved per alert.' : 'Currently unavailable.'}</p></section>
          </div> : !connected ? <div className="notification-empty"><Bell size={28} /><h3>Connect your wallet</h3><button className="notification-primary" disabled={status === 'CONNECTING'} onClick={() => void run(connect)}>{status === 'CONNECTING' ? 'Connecting...' : 'Connect wallet'}</button></div>
          : !model.signedIn ? <div className="notification-empty"><LoaderCircle size={28} className={busy ? 'animate-spin' : ''} /><h3>{busy ? 'Opening your alerts' : 'Alert access needs approval'}</h3><p>{busy ? 'Using your connected wallet.' : 'Approve the signature request to continue. Your wallet stays connected.'}</p>{!busy && <button className="notification-primary" onClick={() => { autoSignInAttempted.current = true; void run(model.signIn) }}>Retry authorization</button>}</div>
          : model.loading && !model.config ? <div role="status" className="space-y-4 animate-pulse"><p className="text-sm text-zinc-400">Loading notifications...</p>{[1, 2, 3].map(i => <div key={i} className="h-16 rounded bg-white/5" />)}</div>
          : view === 'create' || view === 'edit' ? <AlertForm key={editing?.id ?? 'new'} alert={view === 'edit' ? editing : undefined} positions={positions} emailEnabled={model.config?.emailEnabled ?? false} onDirty={setDirty} onPending={setBusy} onSaved={async () => { await model.refresh(); setView('alerts'); setEditing(undefined) }} />
          : view === 'inbox' ? <>
            <div className="mb-4 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} /> Unread only</label>
              <button className="notification-icon" title="Mark all read" aria-label="Mark all read" disabled={busy || !model.unreadCount} onClick={() => void run(() => model.markRead())}><CheckCheck size={18} /></button>
            </div>
            {items.length === 0 ? <div className="notification-empty"><Inbox size={28} /><h3>{unreadOnly ? 'All caught up' : 'No notifications yet'}</h3><button className="notification-command" onClick={() => { setEditing(undefined); setView('create') }}>Create an alert</button></div> : <ul className="divide-y divide-white/10">{items.map(n => {
              const alert = model.alerts.find(a => a.id === n.alertId)
              return <li key={n.id}><button className="group flex w-full items-start gap-3 py-4 text-left" onClick={() => { setSelected(n); setView('detail'); if (!n.readAt) void run(() => model.markRead([n.id])) }}>
                <span className={`mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg ${n.readAt ? 'bg-white/5 text-zinc-500' : 'bg-yellow-400/10 text-yellow-300'}`}><Bell size={15} /></span>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-medium">{alert ? `${alert.codeA}/${alert.codeB}` : 'Pool alert'}{!n.readAt && <span aria-label="Unread" className="size-1.5 rounded-full bg-[#F2C12E]" />}</span><span className="mt-1 block break-words text-xs leading-relaxed text-zinc-400">{n.message}</span><time className="mt-2 block text-[11px] text-zinc-500" dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time></span><ChevronRight size={15} className="mt-2 shrink-0 text-zinc-600 group-hover:text-white" />
              </button></li>
            })}</ul>}
          </> : view === 'alerts' ? <>
            <div className="mb-4 flex items-center justify-between gap-3"><span className="text-xs text-zinc-500">{model.alerts.length}{model.config ? ` / ${model.config.maxAlerts}` : ''} alerts</span><button className="notification-primary" disabled={!model.config || model.alerts.length >= model.config.maxAlerts} onClick={() => { setEditing(undefined); setView('create') }}><Plus size={15} /> Create alert</button></div>
            {model.alerts.length === 0 ? <div className="notification-empty"><Bell size={28} /><h3>No active alerts</h3></div> : <ul className="divide-y divide-white/10">{model.alerts.map(a => <li key={a.id} className="py-4">
              <AlertSummary alert={a} />
              <div className="mt-3 flex items-center justify-between">
                <button className="notification-command" disabled={busy} onClick={() => void mutate(() => updateAlert(a.id, { status: a.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }))}>{a.status === 'ACTIVE' ? <Pause size={14} /> : <Play size={14} />}{a.status === 'ACTIVE' ? 'Pause' : a.status === 'TRIGGERED' ? 'Re-arm' : 'Resume'}</button>
                <details className="relative"><summary className="notification-icon list-none cursor-pointer" aria-label="Alert actions" title="Alert actions"><MoreHorizontal size={18} /></summary><div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-white/15 bg-[#202024] p-1 shadow-xl"><button className="w-full px-3 py-2 text-left text-xs hover:bg-white/5" onClick={() => { setEditing(a); setView('edit') }}>Edit alert</button><button className="w-full px-3 py-2 text-left text-xs text-red-300 hover:bg-white/5" disabled={busy} onClick={() => { if (window.confirm('Delete this alert?')) void mutate(() => deleteAlert(a.id)) }}>Delete alert</button></div></details>
              </div>
            </li>)}</ul>}
          </> : view === 'detail' && selected ? <div className="space-y-5">
            <p className="text-sm leading-relaxed">{selected.message}</p><p className="text-xs text-zinc-500">{new Date(selected.createdAt).toLocaleString()}</p>
            <p className="text-sm text-zinc-400">Triggered value <span className="float-right text-white">{related ? formatAlertValue(related, selected.value) : selected.value}</span></p>
            {related ? <div className="border-t border-white/10 pt-5"><AlertSummary alert={related} /><button className="notification-command mt-4" onClick={() => { setEditing(related); setView('edit') }}>Edit alert</button></div> : <p className="text-xs text-zinc-500">The original alert is no longer available.</p>}
          </div> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-white/10 px-5 py-2 text-[11px] text-zinc-500"><span>{model.signedIn ? 'Wallet verified' : 'Wallet verification required'}</span><button className="notification-icon" aria-label="Refresh notifications" title="Refresh" disabled={model.loading || !model.signedIn} onClick={() => void model.refresh()}><RefreshCw size={14} className={model.loading ? 'animate-spin' : ''} /></button></footer>
      </div>
    </dialog>
  )
}

function AlertSummary({ alert: a }: { alert: PriceAlert }) {
  return <div className="min-w-0 space-y-2">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{a.codeA}/{a.codeB}</h3><span className={`text-[10px] font-medium ${a.status === 'ACTIVE' ? 'text-emerald-400' : a.status === 'TRIGGERED' ? 'text-yellow-300' : 'text-zinc-500'}`}>{a.status}</span></div>
    <p className="break-words text-xs text-zinc-300">{alertSummary(a)}</p>
    <p className="text-xs text-zinc-500">Last value: {formatAlertValue(a, a.lastValue)}</p>
    {a.lastCheckedAt && <p className="text-[11px] text-zinc-500">Checked {new Date(a.lastCheckedAt).toLocaleString()}</p>}
    {a.triggeredAt && <p className="text-xs text-yellow-300">Triggered {new Date(a.triggeredAt).toLocaleString()} at {formatAlertValue(a, a.triggeredValue)}</p>}
    <p className="break-words text-[11px] text-zinc-500">{['Inbox', a.notifyBrowser && 'Browser', a.notifyEmail && a.email].filter(Boolean).join(' / ')}{a.notifyEmail && a.emailStatus ? ` (email ${a.emailStatus.toLowerCase()})` : ''}</p>
  </div>
}
