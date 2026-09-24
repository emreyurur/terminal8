import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { ArrowDown, ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight, CircleHelp, Command, Layers3, Menu, Minus, Plus, ShieldCheck, Terminal, Wallet, X } from 'lucide-react'
import { BrandWordmark } from '../BrandWordmark'
import heroImage from '../../assets/eight-studio.webp'
import xlmLogo from '../../assets/xlm.svg'
import usdcLogo from '../../assets/usdc.svg'
import freighterLogo from '../../assets/freighter.jpg'
import xbullLogo from '../../assets/xbull.jpg'
import lobstrLogo from '../../assets/lobstr.jpg'
import albedoLogo from '../../assets/albedo.png'
import './landing.css'

type LandingPageProps = { onLaunch: () => void; onOpenDocs: () => void }

const sections = [
  { id: 'product', label: 'Product' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'ecosystem', label: 'Ecosystem' },
  { id: 'faq', label: 'FAQ' },
]

const questions = [
  { question: 'What is Terminal8?', answer: 'Terminal8 is a non-custodial DeFi interface on Stellar. You can explore liquidity pools, deposit one or both assets, manage your positions, and set market alerts in one place. The current application runs on Stellar Testnet.' },
  { question: 'Do I need both assets to enter a pool?', answer: 'No. You can supply both assets or choose the single-asset deposit flow. With a single asset, the app prepares the swap and liquidity deposit for you to review and approve in your wallet. Available routes depend on the selected pool.' },
  { question: 'Who controls my funds?', answer: 'You keep control of your wallet and approve on-chain transactions. Terminal8 does not ask for your seed phrase or private keys. After a deposit, your liquidity is subject to the pool and its underlying protocol.' },
  { question: 'Which wallets can I connect?', answer: 'The wallet selector supports Freighter, xBull, LOBSTR, and Albedo. Transaction-signing support can vary by flow; the current deposit, withdrawal, and voting flows use Freighter. Connect to Stellar Testnet for the current app.' },
  { question: 'What do APY and trust scores mean?', answer: 'APY is an estimate based on available pool data, not a guaranteed return. Trust scores and pool profiles provide context for comparing pools. Community votes are separate on-chain signals from eligible position holders. None of these remove liquidity, market, or smart contract risk.' },
  { question: 'Can I withdraw my position?', answer: 'Open your position, choose Withdraw, and review the transaction in your wallet. The amount you receive depends on your pool shares, current reserves, and execution conditions. You can also initiate supported withdrawals from the in-app terminal.' },
]

const commands = [
  { command: 'pools', title: 'Find your next pool.', detail: 'Browse available pools and get the pool ID for your next transaction.', icon: Layers3 },
  { command: 'positions', title: 'Keep your positions in view.', detail: 'Inspect the positions associated with your connected wallet.', icon: Wallet },
  { command: 'help', title: 'A direct line to your DeFi.', detail: 'Find the available commands, including deposit and withdraw. Transactions still require your wallet approval.', icon: Command },
]

function followRoute(event: MouseEvent<HTMLAnchorElement>, callback: () => void) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  callback()
}

export function LandingPage({ onLaunch, onOpenDocs }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeCommand, setActiveCommand] = useState(0)
  const menuButton = useRef<HTMLButtonElement>(null)
  const command = commands[activeCommand]
  const CommandIcon = command.icon

  useEffect(() => {
    if (!menuOpen) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [menuOpen])

  return (
    <div className="t8-landing" id="top">
      <a className="landing-skip" href="#landing-main">Skip to content</a>
      <header className="landing-header">
        <div className="landing-wrap landing-nav">
          <a className="landing-logo" href="#top" aria-label="Terminal8 home" onClick={() => setMenuOpen(false)}><BrandWordmark /></a>
          <nav className="landing-desktop-nav" aria-label="Main navigation">
            {sections.map(({ id, label }) => <a key={id} href={`#${id}`}>{label}</a>)}
          </nav>
          <div className="landing-nav-actions">
            <a className="landing-button landing-button-yellow landing-launch-button nav-launch" href="/app" onClick={(event) => followRoute(event, onLaunch)}>Launch app</a>
            <button ref={menuButton} className="landing-menu-toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="landing-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
          </div>
        </div>
        {menuOpen && <nav className="landing-mobile-nav" id="landing-mobile-nav" aria-label="Mobile navigation">
          {sections.map(({ id, label }) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}<ArrowUpRight size={18} /></a>)}
          <a href="/docs" onClick={(event) => followRoute(event, onOpenDocs)}>Documentation<ArrowUpRight size={18} /></a>
        </nav>}
      </header>

      <main id="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <img className="landing-hero-image" src={heroImage} alt="A polished black 8 billiard ball, with blue and yellow balls on a dark table" fetchPriority="high" width={1536} height={1024} />
          <div className="landing-wrap landing-hero-content">
            <h1 id="landing-title" aria-label="Terminal8"><BrandWordmark className="landing-hero-wordmark" /></h1>
            <p className="landing-hero-heading">Your next move.<br /><span>In your hands.</span></p>
            <p className="landing-hero-description">Explore liquidity. Build your position.<br />One clear view of your DeFi on Stellar.</p>
            <div className="landing-hero-actions">
              <a className="landing-button landing-button-yellow landing-launch-button" href="/app" onClick={(event) => followRoute(event, onLaunch)}>Enter Terminal8</a>
              <a className="landing-text-link" href="#product">Take a closer look <ArrowDown size={16} /></a>
            </div>
          </div>
          <div className="landing-wrap landing-hero-baseline"><span>YOUR WALLET. YOUR POSITION. YOUR CALL.</span><span>BUILT ON <img src={xlmLogo} alt="" /> STELLAR</span></div>
        </section>

        <div className="landing-principles">
          <div className="landing-wrap">
            <span><Wallet size={17} /> Non-custodial by design</span>
            <span><Check size={17} /> Every transaction, wallet approved</span>
            <span><span className="landing-status-dot" /> Available on Stellar Testnet</span>
          </div>
        </div>

        <section className="landing-product landing-light" id="product" aria-labelledby="product-title">
          <div className="landing-wrap">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">01 / THE PRODUCT</p>
              <div><h2 id="product-title">A clearer view.<br />A more considered move.</h2><p>From finding a pool to managing your position, Terminal8 brings the details that matter into focus.</p></div>
            </div>
            <div className="landing-product-grid">
              <article><span className="landing-feature-icon feature-blue"><Layers3 size={22} /></span><h3>Find your angle.</h3><p>Compare liquidity, APY, and pool profiles. Read the signals before you commit.</p><a href="/app" onClick={(event) => followRoute(event, onLaunch)}>Explore pools <ArrowUpRight size={17} /></a></article>
              <article><span className="landing-feature-icon feature-yellow"><ArrowDownLeft size={24} /></span><h3>Make your move.</h3><p>Supply a pair or start with one asset. Review the details and approve from your wallet.</p><a href="#how-it-works">See how it works <ArrowDown size={17} /></a></article>
              <article><span className="landing-feature-icon feature-green"><Bell size={22} /></span><h3>Stay in the picture.</h3><p>Track positions, check performance, and set alerts around the pools you care about.</p><a href="/app" onClick={(event) => followRoute(event, onLaunch)}>Open your dashboard <ArrowUpRight size={17} /></a></article>
            </div>
          </div>
        </section>

        <section className="landing-workflow" id="how-it-works" aria-labelledby="workflow-title">
          <div className="landing-wrap">
            <div className="landing-section-heading"><p className="landing-eyebrow">02 / FROM WALLET TO POSITION</p><div><h2 id="workflow-title">Three steps.<br />You call the shots.</h2><p>Start with a wallet. Finish with a position you can see, understand, and manage.</p></div></div>
            <div className="landing-steps">
              <article><div className="landing-step-top"><span className="landing-ball-number ball-yellow">1</span><ArrowRight size={22} /></div><h3>Connect your wallet.</h3><p>Choose a supported Stellar wallet. Your keys stay with you.</p><div className="landing-step-detail"><Wallet size={18} /><span>Wallet-connected session</span></div></article>
              <article><div className="landing-step-top"><span className="landing-ball-number ball-blue">2</span><ArrowRight size={22} /></div><h3>Choose your pool.</h3><p>Review the pair, its liquidity, and risk signals. Select one or both assets to deposit.</p><div className="landing-step-detail"><span className="landing-token-pair"><img src={xlmLogo} alt="XLM" /><img src={usdcLogo} alt="USDC" /></span><span>One asset or a pair</span></div></article>
              <article><div className="landing-step-top"><span className="landing-ball-number ball-red">3</span><Check size={22} /></div><h3>Review. Sign. Manage.</h3><p>Approve the transaction, follow it on the explorer, and manage your position in the app.</p><div className="landing-step-detail"><ShieldCheck size={18} /><span>You approve every move</span></div></article>
            </div>
            <div className="landing-workflow-note"><span><CircleHelp size={16} /> Start on Testnet with test assets.</span><a className="landing-text-link" href="/docs" onClick={(event) => followRoute(event, onOpenDocs)}>Read the getting-started guide <ArrowUpRight size={16} /></a></div>
          </div>
        </section>

        <section className="landing-terminal-section" aria-labelledby="terminal-title">
          <div className="landing-wrap landing-terminal-layout">
            <div className="landing-terminal-copy"><p className="landing-eyebrow">FOR THE HANDS-ON</p><h2 id="terminal-title">An interface.<br />And a command line.</h2><p>Some moves are faster in the terminal. Inspect pools and positions, check balances, or initiate a deposit or withdrawal without leaving the app.</p><a className="landing-text-link" href="/app" onClick={(event) => followRoute(event, onLaunch)}>Meet your terminal <ArrowUpRight size={17} /></a></div>
            <div className="landing-command-preview">
              <div className="landing-command-header"><span><Terminal size={17} /> Terminal8</span><span>COMMAND PREVIEW</span></div>
              <div className="landing-command-body" id="command-panel" role="tabpanel" aria-labelledby={`command-${activeCommand}`}>
                <p className="landing-command-line"><span>terminal8</span><ChevronRight size={18} /><code>{command.command}</code></p>
                <CommandIcon size={26} strokeWidth={1.4} />
                <h3>{command.title}</h3><p>{command.detail}</p>
              </div>
              <div className="landing-command-tabs" role="tablist" aria-label="Explore terminal commands">
                {commands.map((item, index) => <button key={item.command} id={`command-${index}`} type="button" role="tab" aria-selected={activeCommand === index} aria-controls="command-panel" tabIndex={activeCommand === index ? 0 : -1} onClick={() => setActiveCommand(index)} onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? commands.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + commands.length) % commands.length
                  setActiveCommand(next)
                  document.getElementById(`command-${next}`)?.focus()
                }}>{item.command}</button>)}
              </div>
            </div>
          </div>
        </section>

        <section className="landing-ecosystem landing-light" id="ecosystem" aria-labelledby="ecosystem-title">
          <div className="landing-wrap">
            <div className="landing-section-heading"><p className="landing-eyebrow">03 / ROOTED IN STELLAR</p><div><h2 id="ecosystem-title">Familiar wallets.<br />A connected experience.</h2><p>Built around Stellar assets, on-chain liquidity, and wallet-signed transactions.</p></div></div>
            <div className="landing-network-row"><div><img src={xlmLogo} alt="" /><span>Stellar</span><small>THE NETWORK</small></div><div><Layers3 size={28} /><span>Soroban</span><small>SMART CONTRACTS</small></div><div><ShieldCheck size={28} /><span>Your wallet</span><small>YOUR APPROVAL</small></div></div>
            <div className="landing-wallet-row"><p>CONNECT WITH</p><div>{[{ name: 'Freighter', image: freighterLogo }, { name: 'xBull', image: xbullLogo }, { name: 'LOBSTR', image: lobstrLogo }, { name: 'Albedo', image: albedoLogo }].map((wallet) => <span key={wallet.name}><img loading="lazy" src={wallet.image} alt="" />{wallet.name}</span>)}</div></div>
            <p className="landing-wallet-note">Freighter is used for the current transaction-signing flows. More details in the <a href="#faq">FAQ</a>.</p>
          </div>
        </section>

        <section className="landing-faq" id="faq" aria-labelledby="faq-title">
          <div className="landing-wrap landing-faq-layout">
            <div><p className="landing-eyebrow">04 / GOOD QUESTIONS</p><h2 id="faq-title">Before your<br />first move.</h2><p>A little context goes a long way.</p><a className="landing-text-link" href="/docs" onClick={(event) => followRoute(event, onOpenDocs)}>Explore the docs <ArrowUpRight size={16} /></a></div>
            <div className="landing-faq-list">{questions.map((item, index) => <details key={item.question} name="landing-faq" open={index === 0}><summary><span>{item.question}</span><Plus className="faq-plus" size={18} /><Minus className="faq-minus" size={18} /></summary><p>{item.answer}</p></details>)}</div>
          </div>
        </section>

        <section className="landing-cta" aria-labelledby="cta-title"><div className="landing-wrap"><div><p className="landing-eyebrow">THE NEXT MOVE IS YOURS</p><h2 id="cta-title">Step up to the table.</h2></div><a className="landing-button landing-button-black landing-launch-button" href="/app" onClick={(event) => followRoute(event, onLaunch)}>Launch Terminal8</a></div></section>
      </main>

      <footer className="landing-footer"><div className="landing-wrap">
        <div className="landing-footer-top"><a href="#top" aria-label="Terminal8, back to top"><BrandWordmark /></a><p>A clearer angle on Stellar DeFi.</p><a className="landing-text-link" href="#top">Back to top <ArrowUpRight size={16} /></a></div>
        <div className="landing-footer-links"><nav aria-label="Footer navigation"><a href="#product">Product</a><a href="#how-it-works">How it works</a><a href="#ecosystem">Ecosystem</a><a href="#faq">FAQ</a><a href="/docs" onClick={(event) => followRoute(event, onOpenDocs)}>Documentation <ArrowUpRight size={14} /></a></nav><span><span className="landing-status-dot" /> Stellar Testnet</span></div>
        <div className="landing-footer-bottom"><span>&copy; {new Date().getFullYear()} Terminal8</span><p>DeFi involves risk. Estimated returns are not guaranteed.</p><span>Stellar / Soroban</span></div>
      </div></footer>
    </div>
  )
}
