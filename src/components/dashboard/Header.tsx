import { useEffect, useRef, useState } from 'react'
import eightLogo from '../../assets/eight.svg'
import { truncatePublicKey } from '../../lib/format'
import { useWallet } from '../../context/useWallet'
import type { WalletErrorType } from '../../context/WalletContext'

type HeaderProps = {
  activePage: 'landing' | 'home' | 'studio' | 'ramp' | 'docs' | 'tester'
  onPageChange: (page: 'landing' | 'home' | 'studio' | 'ramp' | 'docs' | 'tester') => void
  onToggleTerminal?: () => void
}

const NAV_LABELS: Record<'home' | 'studio' | 'ramp' | 'docs', string> = {
  home: 'Home',
  studio: 'Token Studio',
  ramp: 'Ramp',
  docs: 'Docs',
}

const ERROR_ICONS: Record<WalletErrorType, string> = {
  wallet_not_found: '⬛',
  user_rejected: '✕',
  insufficient_balance: '◎',
  unknown: '!',
}

const ERROR_LABELS: Record<WalletErrorType, string> = {
  wallet_not_found: 'Wallet not found',
  user_rejected: 'User Cancelled',
  insufficient_balance: 'Insufficient balance',
  unknown: 'Connection Error',
}

export function Header({ activePage, onPageChange, onToggleTerminal }: HeaderProps) {
  const { connect, error, errorType, publicKey, reset, status } = useWallet()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const connected = status === 'CONNECTED' && publicKey

  const handleCopyAddress = async (e: React.SyntheticEvent) => {
    e.stopPropagation()
    if (!publicKey) return
    try {
      await navigator.clipboard.writeText(publicKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!accountMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [accountMenuOpen])

  const handleWalletClick = () => {
    if (connected) {
      setAccountMenuOpen((current) => !current)
      return
    }

    void connect()
  }

  const handleDisconnect = () => {
    void reset()
    setAccountMenuOpen(false)
  }

  return (
    <nav className="sticky start-0 top-0 z-50 w-full border-b border-white/[0.08] bg-[#0A0A0E]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between p-4">
        <button
          className="group flex items-center space-x-3 text-left rtl:space-x-reverse"
          onClick={() => onPageChange('landing')}
          title="Return to Landing Page"
          type="button"
        >
          <span
            className="flex items-center gap-1.5 leading-none text-[#F0F0F0]"
            style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}
          >
            <span>TERMINAL</span>
            <img
              alt="8"
              className="h-7 w-auto shrink-0 transition-transform duration-200 group-hover:scale-105"
              src={eightLogo}
            />
          </span>
        </button>

        <div className="flex items-center space-x-3 md:order-2 md:space-x-0 rtl:space-x-reverse">
          <div className="relative" ref={accountMenuRef}>
            <button
              aria-expanded={accountMenuOpen}
              className="inline-flex min-w-27 items-center justify-center gap-2 rounded-xl border border-[#F2C12E]/50 bg-transparent px-4 py-2 text-xs font-semibold tracking-wide text-[#F0F0F0] transition hover:border-[#F2C12E] hover:text-[#F2C12E] focus:outline-none focus:ring-2 focus:ring-[#F2C12E]/60"
              disabled={status === 'CONNECTING'}
              onClick={handleWalletClick}
              type="button"
            >
              <span className="relative flex size-2 shrink-0 items-center justify-center">
                {connected ? (
                  <>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#16A34A] opacity-50" />
                    <span className="relative inline-flex size-2 rounded-full bg-[#16A34A]" />
                  </>
                ) : (
                  <span
                    className={`inline-flex size-2 rounded-full ${status === 'ERROR' ? 'bg-red-400' : 'bg-[#6B7B6B]/40'}`}
                  />
                )}
              </span>
              {status === 'CONNECTING' ? (
                'Connecting...'
              ) : connected ? (
                <span className="inline-flex items-center gap-1.5">
                  <span>{truncatePublicKey(publicKey)}</span>
                  {/* span (not button): this sits inside the wallet <button>, nested buttons are invalid HTML */}
                  <span
                    aria-label="Copy address"
                    className="inline-flex cursor-pointer rounded p-0.5 transition hover:bg-white/[0.15] hover:text-[#F2C12E]"
                    onClick={handleCopyAddress}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        void handleCopyAddress(e)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    title="Copy address"
                  >
                    {copied ? (
                      <svg className="size-3.5 text-[#16A34A]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                      </svg>
                    )}
                  </span>
                </span>
              ) : (
                'Connect Wallet'
              )}
            </button>

            {connected && accountMenuOpen ? (
              <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/[0.12] bg-[#14141E] shadow-2xl">
                <div className="border-b border-white/[0.08] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9CA3AF]">
                      Connected wallet
                    </p>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-[#F0F0F0] transition hover:border-[#F2C12E] hover:bg-[#F2C12E]/10 hover:text-[#F2C12E]"
                      onClick={handleCopyAddress}
                      title="Copy wallet address"
                      type="button"
                    >
                      {copied ? (
                        <>
                          <svg className="size-3.5 text-[#16A34A]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          <span className="text-[#16A34A]">Copied</span>
                        </>
                      ) : (
                        <>
                          <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mt-2.5 break-all font-mono text-xs font-medium text-[#F0F0F0]">{publicKey}</p>
                </div>
                <button
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[#F0F0F0] transition hover:bg-red-500/10 hover:text-red-400"
                  onClick={handleDisconnect}
                  type="button"
                >
                  <span className="flex items-center gap-2.5">
                    <svg className="size-4 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                    </svg>
                    <span>Disconnect</span>
                  </span>
                  <span className="text-xs text-[#9CA3AF]">Esc</span>
                </button>
              </div>
            ) : null}
          </div>

          <button
            aria-controls="navbar-sticky"
            aria-expanded={mobileMenuOpen}
            className="ml-2 inline-flex size-10 items-center justify-center rounded-lg p-2 text-sm text-[#9CA3AF] hover:bg-white/[0.06] hover:text-[#F0F0F0] focus:outline-none focus:ring-2 focus:ring-white/20 md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            type="button"
          >
            <span className="sr-only">Open main menu</span>
            <svg aria-hidden="true" className="size-6" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </button>
        </div>

        <div
          className={`${mobileMenuOpen ? 'block' : 'hidden'} w-full items-center justify-between md:order-1 md:flex md:w-auto`}
          id="navbar-sticky"
        >
          <ul className="mt-4 flex flex-col rounded-xl border border-white/[0.08] bg-[#12121A] p-4 font-medium md:mt-0 md:flex-row md:items-center md:space-x-8 md:border-0 md:bg-transparent md:p-0 rtl:space-x-reverse">
            {(['home', 'studio', 'ramp', 'docs'] as const).map((page) => (
              <li key={page}>
                <button
                  aria-pressed={activePage === page}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm tracking-wide transition md:p-0 ${
                    activePage === page
                      ? 'font-semibold text-[#F2C12E]'
                      : 'font-medium text-[#9CA3AF] hover:bg-white/[0.06] hover:text-[#F2C12E] md:hover:bg-transparent'
                  }`}
                  onClick={() => {
                    onPageChange(page)
                    setMobileMenuOpen(false)
                  }}
                  type="button"
                >
                  {NAV_LABELS[page]}
                </button>
              </li>
            ))}
            <li>
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium tracking-wide text-[#9CA3AF] transition hover:bg-white/[0.06] hover:text-[#F2C12E] md:p-0 md:hover:bg-transparent"
                onClick={() => {
                  onToggleTerminal?.()
                  setMobileMenuOpen(false)
                }}
                type="button"
              >
                <span>Terminal</span>
                <kbd className="hidden rounded border border-white/[0.12] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-[#9CA3AF] md:inline-block">
                  Ctrl+J
                </kbd>
              </button>
            </li>
          </ul>
        </div>
      </div>


      {/* Error banner with typed error display */}
      {error && errorType ? (
        <div className="border-t border-red-500/20 bg-[#0D0D12] px-0 py-0">
          <div
            className={`mx-auto max-w-[1440px] rounded-lg border px-4 py-3 text-sm lg:mt-2 lg:max-w-sm lg:ml-auto ${
              errorType === 'wallet_not_found'
                ? 'border-orange-400/30 bg-orange-50/10 text-orange-200'
                : errorType === 'user_rejected'
                  ? 'border-yellow-400/30 bg-yellow-50/10 text-yellow-200'
                  : errorType === 'insufficient_balance'
                    ? 'border-red-400/30 bg-red-50/10 text-red-200'
                    : 'border-[#F2C12E]/35 bg-white/5 text-[#F0F0F0]'
            }`}
          >
            <p className="font-semibold">
              {ERROR_ICONS[errorType]} {ERROR_LABELS[errorType]}
            </p>
            <p className="mt-1 text-xs opacity-80">{error}</p>
          </div>
        </div>
      ) : null}
    </nav>
  )
}
