import { useCallback, useEffect, useMemo, useState } from 'react'
import { DefiOperations } from './components/dashboard/DefiOperations'
import { Header } from './components/dashboard/Header'
import { RiskQuiz } from './components/dashboard/RiskQuiz'
import { ApiTesterView } from './components/dashboard/ApiTesterView'
import { NotificationsPanel } from './components/dashboard/NotificationsPanel'
import type { AlertNotification } from './services/alertsApi'
import { DocsPage } from './components/docs/DocsPage'
import { LandingPage } from './components/landing/LandingPage'
import { BottomTerminal, CommandPalette } from './components/terminal/CommandPalette'
import type { CommandContext, TerminalLine } from './components/terminal/commandRegistry'
import { WalletProvider } from './context/WalletContext'
import { useWallet } from './context/useWallet'
import { useWalletBalances } from './hooks/useWalletBalances'
import { useAlertNotifications } from './hooks/useAlertNotifications'
import { addPosition, mergePositionsByPool } from './lib/positions'
import { recoverLpPositions } from './services/positionRecovery'
import type { LocalPosition, RiskProfile, WalletBalance } from './types/stellar'

export type AppPage = 'landing' | 'home' | 'docs' | 'tester'

const initialLines: TerminalLine[] = [
  { id: 'boot-1', kind: 'log', text: 'Soroban RPC ready. Type help for commands.' },
  { id: 'boot-2', kind: 'log', text: 'positions - withdraw <n> --full - pools - balance' },
]

function getBestTokenBalance(balances: WalletBalance[], code: string): number {
  const matching = balances.filter((b) => b.code.toUpperCase() === code.toUpperCase())
  if (matching.length === 0) return 0
  return matching.reduce((max, b) => Math.max(max, Number(b.balance) || 0), 0)
}

const STORAGE_KEY_PREFIX = 'terminal8_user_positions'

function loadPositionsFromStorage(pubKey?: string | null): LocalPosition[] {
  if (!pubKey) return []
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}_${pubKey}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return mergePositionsByPool(parsed)
    }
  } catch {
    /* ignore storage read errors */
  }
  return []
}

function savePositionsToStorage(positions: LocalPosition[], pubKey?: string | null) {
  if (!pubKey) return
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}_${pubKey}`, JSON.stringify(positions))
  } catch {
    /* ignore storage write errors */
  }
}

const ACTIVE_PAGE_STORAGE_KEY = 'terminal8_active_page'

function getStoredActivePage(): AppPage {
  try {
    const saved = localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY)
    if (saved === 'alerts') return 'home'
    if (saved && ['landing', 'home', 'docs', 'tester'].includes(saved)) {
      return saved as AppPage
    }
  } catch {
    /* ignore */
  }
  return 'landing'
}

function AppInner() {
  const { networkPassphrase, networkUrl, publicKey, status } = useWallet()
  const { balances, refreshBalances } = useWalletBalances()

  const [activePageRaw, setActivePageRaw] = useState<AppPage>(() => getStoredActivePage())

  const setActivePage = useCallback((page: AppPage) => {
    setActivePageRaw(page)
    try {
      localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, page)
    } catch {
      /* ignore */
    }
  }, [])

  const activePage = activePageRaw
  const [notificationPanel, setNotificationPanel] = useState<{ scope: string; notification?: AlertNotification } | null>(null)
  const notificationScope = `${status}:${publicKey}:${networkPassphrase}`
  const openNotifications = useCallback((notification?: AlertNotification) => {
    setNotificationPanel({ scope: notificationScope, notification })
    if (activePageRaw === 'landing') setActivePage('home')
  }, [notificationScope, activePageRaw, setActivePage])
  const alertsModel = useAlertNotifications(
    status === 'CONNECTED' ? publicKey : null,
    openNotifications,
    networkPassphrase ?? '',
  )
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>(initialLines)
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>('Moderate')
  const [showQuiz, setShowQuiz] = useState(false)
  const [localPositions, setLocalPositions] = useState<LocalPosition[]>(() =>
    loadPositionsFromStorage(publicKey),
  )

  useEffect(() => {
    queueMicrotask(() => {
      setLocalPositions(loadPositionsFromStorage(publicKey))
    })
  }, [publicKey])

  useEffect(() => {
    if (status !== 'CONNECTED' || !publicKey || !networkUrl) return
    const controller = new AbortController()
    const known = new Set(loadPositionsFromStorage(publicKey).map((p) => p.poolId))

    recoverLpPositions(networkUrl, publicKey, known, controller.signal)
      .then((recovered) => {
        if (controller.signal.aborted || recovered.length === 0) return
        setLocalPositions((current) => {
          const have = new Set(current.map((p) => p.poolId))
          const additions = recovered.filter((p) => !have.has(p.poolId))
          if (additions.length === 0) return current
          const next = mergePositionsByPool([...current, ...additions])
          savePositionsToStorage(next, publicKey)
          return next
        })
      })
      .catch(() => {
        /* recovery is best effort; local records keep working */
      })

    return () => controller.abort()
  }, [status, publicKey, networkUrl])

  useEffect(() => {
    let lastCtrlKTime = 0
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        lastCtrlKTime = Date.now()
        setPaletteOpen((v) => !v)
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') ||
        (e.key.toLowerCase() === 'j' && Date.now() - lastCtrlKTime < 1500)
      ) {
        e.preventDefault()
        setTerminalOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const appendLines = useCallback((lines: TerminalLine[]) => {
    setTerminalLines((current) => [...current, ...lines])
    setTerminalOpen(true)
  }, [])

  const handleWithdrawn = useCallback((idOrPoolId: string, withdrawnAmount: number) => {
    setLocalPositions((current) => {
      const pos = current.find((p) => p.id === idOrPoolId || p.poolId === idOrPoolId || p.asset === idOrPoolId)
      if (!pos) return current
      let next: LocalPosition[]
      if (withdrawnAmount >= pos.amount || withdrawnAmount <= 0) {
        next = current.filter((p) => p.id !== pos.id)
      } else {
        next = current.map((p) =>
          p.id === pos.id ? { ...p, amount: Math.max(0, p.amount - withdrawnAmount) } : p,
        )
      }
      savePositionsToStorage(next, publicKey)
      return next
    })
    refreshBalances()
  }, [publicKey, refreshBalances])

  const handlePositionAdded = useCallback((pos: Omit<LocalPosition, 'id'>) => {
    setLocalPositions((current) => {
      const next = addPosition(current, { ...pos, id: `${pos.hash || pos.poolId}-${Date.now()}` })
      savePositionsToStorage(next, publicKey)
      return next
    })
    refreshBalances()
  }, [publicKey, refreshBalances])

  useEffect(() => {
    if (activePage === 'home') refreshBalances()
  }, [activePage, refreshBalances])

  const xlmBalance = getBestTokenBalance(balances, 'XLM')
  const usdcBalance = getBestTokenBalance(balances, 'USDC')

  const commandContext = useMemo<CommandContext>(
    () => ({
      networkPassphrase,
      networkUrl,
      positions: localPositions,
      publicKey,
      status,
      xlmBalance,
      usdcBalance,
      onWithdrawn: handleWithdrawn,
    }),
    [networkPassphrase, networkUrl, localPositions, publicKey, status, xlmBalance, usdcBalance, handleWithdrawn],
  )

  const handleLaunchApp = () => {
    setActivePage('home')
  }

  if (activePage === 'landing') {
    return (
      <LandingPage
        onLaunch={handleLaunchApp}
        onOpenDocs={() => setActivePage('docs')}
      />
    )
  }

  return (
    <div className="min-h-screen bg-[#080B10] text-[#F0F0F0]">
      <Header
        activePage={activePage}
        onPageChange={setActivePage}
        onToggleTerminal={() => setTerminalOpen(true)}
        unreadAlerts={alertsModel.unreadCount}
        notificationsOpen={notificationPanel?.scope === notificationScope}
        onOpenNotifications={() => openNotifications()}
      />

      <main
        className={`terminal8-product-ui mx-auto w-full ${
          activePage === 'docs'
            ? 'max-w-[1440px] px-4 py-0 sm:px-6'
            : 'max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10'
        } ${
          terminalOpen ? 'pb-88' : 'pb-20'
        }`}
      >
        {activePage === 'home' ? (
          <div className="space-y-6">
            <DefiOperations
              balances={balances}
              onPositionAdded={handlePositionAdded}
              onRetakeQuiz={() => setShowQuiz(true)}
              onWithdrawn={handleWithdrawn}
              positions={localPositions}
              riskProfile={riskProfile}
              usdcBalance={usdcBalance}
              xlmBalance={xlmBalance}
            />
          </div>
        ) : activePage === 'tester' ? (
          <ApiTesterView />
        ) : (
          <DocsPage />
        )}
      </main>

      {notificationPanel?.scope === notificationScope && (
        <NotificationsPanel key={notificationScope} model={alertsModel} positions={localPositions} initialNotification={notificationPanel.notification} onClose={() => setNotificationPanel(null)} />
      )}
      {showQuiz && (
        <RiskQuiz
          onComplete={(profile) => { setRiskProfile(profile); setShowQuiz(false) }}
          onSkip={() => { setRiskProfile('Moderate'); setShowQuiz(false) }}
        />
      )}

      <CommandPalette
        lines={terminalLines}
        onClose={() => setPaletteOpen(false)}
        onSubmitLines={appendLines}
        open={paletteOpen}
      />
      <BottomTerminal
        commandContext={commandContext}
        lines={terminalLines}
        onClear={() => setTerminalLines([])}
        onClose={() => setTerminalOpen(false)}
        onOpen={() => setTerminalOpen(true)}
        onRunCommand={appendLines}
        open={terminalOpen}
      />
    </div>
  )
}

function App() {
  return (
    <WalletProvider>
      <AppInner />
    </WalletProvider>
  )
}

export default App
