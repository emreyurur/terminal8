import {
  ArrowRight,
  Bell,
  Check,
  ExternalLink,
  Layers3,
  ShieldCheck,
  WalletCards,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { POOL_VOTING_CONTRACT_ID } from '../../services/poolVotingContract'

const navSections = [
  {
    id: 'start',
    label: 'Getting Started',
    items: [
      { id: 'overview', label: 'What is Terminal8?' },
      { id: 'workflow', label: 'How it works' },
    ],
  },
  {
    id: 'product',
    label: 'Product',
    items: [
      { id: 'positions', label: 'Pools & positions' },
      { id: 'transactions', label: 'Deposits & withdrawals' },
      { id: 'alerts', label: 'Alerts & notifications' },
    ],
  },
  {
    id: 'developers',
    label: 'Developers',
    items: [
      { id: 'architecture', label: 'Architecture & stack' },
      { id: 'contracts', label: 'On-chain contracts' },
    ],
  },
]

const pageSections = navSections.flatMap((section) => section.items)

export function DocsPage({ onOpenDashboard }: { onOpenDashboard: () => void }) {
  const [activeSection, setActiveSection] = useState('overview')

  useEffect(() => {
    const sections = pageSections
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section))
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiveSection(visible.target.id)
      },
      { rootMargin: '-96px 0px -62% 0px', threshold: [0, 0.1] },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveSection(id)
  }

  return (
    <div className="terminal8-docs mx-auto grid w-full max-w-[1120px] grid-cols-1 py-6 lg:grid-cols-[210px_minmax(0,820px)] lg:gap-10 lg:py-9">
      <nav className="mb-7 flex gap-2 overflow-x-auto border-b border-white/[0.07] pb-3 lg:hidden" aria-label="Documentation sections">
        {pageSections.map((item) => (
          <button
            className={`h-8 shrink-0 rounded-md px-3 text-xs font-medium transition ${
              activeSection === item.id
                ? 'bg-[#F2C12E]/10 text-[#F2C12E]'
                : 'text-[#98A6B7] hover:bg-white/[0.04] hover:text-white'
            }`}
            key={item.id}
            onClick={() => scrollTo(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>

      <aside className="hidden border-r border-white/[0.07] lg:block">
        <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pr-6">
          {navSections.map((section) => (
            <div className="mb-7" key={section.id}>
              <p className="mb-2 px-3 text-[11px] font-medium text-[#718096]">{section.label}</p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <button
                    className={`relative flex min-h-9 w-full items-center rounded-md px-3 py-2 text-left text-[13px] transition ${
                      activeSection === item.id
                        ? 'bg-white/[0.045] font-medium text-white before:absolute before:inset-y-2 before:left-0 before:w-px before:bg-[#F2C12E]'
                        : 'font-normal text-[#98A6B7] hover:bg-white/[0.03] hover:text-white'
                    }`}
                    key={item.id}
                    onClick={() => scrollTo(item.id)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-8 border-t border-white/[0.07] px-3 pt-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#718096]">Network</span>
              <span className="flex size-1.5 rounded-full bg-[#35D49A]" />
            </div>
            <p className="mt-2 text-xs font-medium text-[#D7DEE8]">Stellar Testnet</p>
            <p className="mt-1 text-[11px] leading-4 text-[#718096]">Soroban RPC and Horizon</p>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <section className="scroll-mt-28 pt-1" id="overview">
          <StatusBadge>Live on Stellar Testnet</StatusBadge>
          <h1 className="mt-5 text-3xl font-medium leading-tight text-white sm:text-4xl">Terminal8 documentation</h1>
          <p className="mt-4 max-w-[720px] text-[15px] leading-7 text-[#A5B1C2]">
            Terminal8 is a non-custodial Stellar DeFi app for discovering liquidity opportunities,
            depositing into pools, tracking positions and receiving market alerts from one interface.
            Your connected wallet keeps control of your assets and approves every on-chain transaction.
          </p>

          <div className="mt-9 grid border-y border-white/[0.07] sm:grid-cols-2">
            <Feature icon={Layers3} title="Explore pools">
              Compare APY, deposits, vault profile and trust score before choosing a position.
            </Feature>
            <Feature icon={WalletCards} title="Deposit your way">
              Supply both pool assets or start with one asset and let the transaction flow prepare the pair.
            </Feature>
            <Feature icon={Workflow} title="Manage positions">
              Review supplied value and earned yield, then add liquidity or withdraw from the same vault view.
            </Feature>
            <Feature icon={Bell} title="Stay informed">
              Create pool alerts and follow triggered events through the notification panel.
            </Feature>
          </div>
        </section>

        <DocsDivider />

        <section className="scroll-mt-28" id="workflow">
          <SectionLabel>Getting Started</SectionLabel>
          <h2 className="mt-2 text-2xl font-medium text-[#F0F0F0]">How Terminal8 works</h2>
          <p className="mt-3 max-w-[700px] text-sm leading-6 text-[#98A6B7]">
            The app keeps discovery, signing and portfolio monitoring in a single flow. Private keys never
            enter Terminal8; signing stays in the wallet selected by the user.
          </p>
          <div className="mt-7 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            <Step number="01" title="Connect a wallet">Use Freighter, xBull, LOBSTR or Albedo through Stellar Wallets Kit.</Step>
            <Step number="02" title="Choose a pool">Review its assets, APY, liquidity, vault profile and trust score.</Step>
            <Step number="03" title="Review and sign">Terminal8 prepares the transaction. Your wallet displays and signs the XDR before submission.</Step>
            <Step number="04" title="Track and manage">The position is synchronized after confirmation and becomes available in My Positions.</Step>
          </div>
        </section>

        <DocsDivider />

        <section className="scroll-mt-28" id="positions">
          <SectionLabel>Product</SectionLabel>
          <h2 className="mt-2 text-2xl font-medium text-[#F0F0F0]">Pools and positions</h2>
          <p className="mt-3 text-sm leading-6 text-[#98A6B7]">
            The Home screen brings together available vaults and wallet positions. Pool rows show the
            information needed to compare opportunities without hiding the asset pair or protocol behind a single score.
          </p>
          <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2">
            <InfoBlock title="Vault discovery">
              APY, total deposits, vault profile and trust score are displayed together. Soroswap and Blend
              integrations are represented by the services used by the application.
            </InfoBlock>
            <InfoBlock title="My Positions">
              Active positions show API-reported supplied value, APY and earned interest. Manage opens the
              deposit and withdrawal controls for that vault.
            </InfoBlock>
            <InfoBlock title="Position persistence">
              Confirmed positions are stored per wallet in the browser and synchronized with the portfolio API when that flow is available.
            </InfoBlock>
            <InfoBlock title="On-chain recovery">
              Terminal8 can inspect LP balances and restore positions that exist on-chain but are missing from the current browser session.
            </InfoBlock>
          </div>
        </section>

        <DocsDivider />

        <section className="scroll-mt-28" id="transactions">
          <SectionLabel>Transactions</SectionLabel>
          <h2 className="mt-2 text-2xl font-medium text-[#F0F0F0]">Deposits and withdrawals</h2>
          <p className="mt-3 text-sm leading-6 text-[#98A6B7]">
            Terminal8 separates transaction preparation from authorization. The API builds an unsigned XDR,
            the connected wallet signs it, and the signed envelope is submitted to Stellar.
          </p>
          <div className="mt-7 space-y-3">
            <FlowRow endpoint="POST /api/v1/transactions/build" title="Both assets">
              Builds deposit and withdrawal transactions when the wallet supplies the pool assets directly.
            </FlowRow>
            <FlowRow endpoint="POST /api/v1/transactions/single-asset-deposit" title="Single asset">
              Builds the atomic plan used to prepare the required pair from one selected asset and deposit it.
            </FlowRow>
            <FlowRow endpoint="POST /api/v1/portfolio/sync" title="Portfolio sync">
              Runs after submission so the confirmed position can be reflected in the portfolio experience.
            </FlowRow>
          </div>
          <div className="mt-5 flex gap-3 rounded-lg border border-[#35D49A]/20 bg-[#35D49A]/[0.05] p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#35D49A]" aria-hidden="true" />
            <p className="text-[13px] leading-6 text-[#A9B7C8]">
              Transaction details should always be checked in the wallet before approval. Terminal8 does not receive or store private keys.
            </p>
          </div>
        </section>

        <DocsDivider />

        <section className="scroll-mt-28" id="alerts">
          <SectionLabel>Monitoring</SectionLabel>
          <h2 className="mt-2 text-2xl font-medium text-[#F0F0F0]">Alerts and notifications</h2>
          <p className="mt-3 text-sm leading-6 text-[#98A6B7]">
            Alerts use the connected wallet session, so users do not connect a second wallet. A signed
            authentication challenge creates the JWT used by the alerts API.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <MiniFeature title="Create and manage">Set a pool, metric, condition, quote side and threshold. Alerts can be edited, paused or deleted.</MiniFeature>
            <MiniFeature title="In-app inbox">Triggered events appear in the notifications panel and can be marked as read.</MiniFeature>
            <MiniFeature title="Delivery options">Browser notifications are supported. Email is offered only when the API reports it as enabled.</MiniFeature>
          </div>
        </section>

        <DocsDivider />

        <section className="scroll-mt-28" id="architecture">
          <SectionLabel>Developers</SectionLabel>
          <h2 className="mt-2 text-2xl font-medium text-[#F0F0F0]">Architecture and technology stack</h2>
          <p className="mt-3 text-sm leading-6 text-[#98A6B7]">
            This documentation describes the technology present in this repository. The Terminal8 API is an
            external service boundary; its internal database or queue implementation is not assumed here.
          </p>
          <div className="mt-7 overflow-hidden rounded-lg border border-white/[0.07]">
            <TechRow area="Application" detail="React 19.2, TypeScript 6, Vite 8 and Tailwind CSS 4" />
            <TechRow area="Stellar" detail="Stellar SDK 15.1, Stellar Wallets Kit 2.5 and Freighter API 6" />
            <TechRow area="DeFi" detail="Blend SDK 3.2 and Soroswap transaction services" />
            <TechRow area="Interface" detail="Lucide React icons and responsive React components" />
            <TechRow area="Quality" detail="Vitest 4, Testing Library, jsdom and ESLint 10" />
          </div>
          <div className="mt-7 rounded-lg border border-white/[0.07] bg-[#0C1118] p-5 sm:p-6">
            <p className="text-xs font-medium text-[#F2C12E]">Application flow</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
              <ArchitectureNode title="React UI">Dashboard, docs, alerts and terminal</ArchitectureNode>
              <ArrowRight className="hidden size-4 text-[#657284] sm:block" aria-hidden="true" />
              <ArchitectureNode title="Hooks & services">Wallet, positions, APIs and XDR flows</ArchitectureNode>
              <ArrowRight className="hidden size-4 text-[#657284] sm:block" aria-hidden="true" />
              <ArchitectureNode title="Network">Terminal8 API, Horizon and Soroban RPC</ArchitectureNode>
            </div>
          </div>
        </section>

        <DocsDivider />

        <section className="scroll-mt-28" id="contracts">
          <SectionLabel>On-chain</SectionLabel>
          <h2 className="mt-2 text-2xl font-medium text-[#F0F0F0]">Contracts and network addresses</h2>
          <p className="mt-3 text-sm leading-6 text-[#98A6B7]">
            The current application targets Stellar Testnet for its Soroban pool voting and Soroswap liquidity
            flows. These addresses are the values used by the frontend services.
          </p>
          <div className="mt-7 rounded-lg border border-[#F2C12E]/20 bg-[#0C1118] p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-white">PoolVotingContract</h3>
                  <StatusBadge>Active</StatusBadge>
                </div>
                <p className="mt-2 text-[13px] leading-6 text-[#98A6B7]">
                  The frontend reads pool scores with <Code>get_score</Code> and submits signed votes with <Code>vote</Code> through Soroban RPC.
                </p>
                <code className="mt-3 block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-[#D9B73A]">{POOL_VOTING_CONTRACT_ID}</code>
              </div>
              <a
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-white/[0.1] px-3 text-xs font-medium text-[#D7DEE8] transition hover:border-[#F2C12E]/40 hover:text-white"
                href={`https://stellar.expert/explorer/testnet/contract/${POOL_VOTING_CONTRACT_ID}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                Explorer
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/[0.07]">
            <table className="w-full min-w-[660px] text-left text-sm">
              <thead className="border-b border-white/[0.07] bg-[#101720] text-[11px] text-[#8795A8]">
                <tr><th className="px-5 py-3 font-medium">Service</th><th className="px-5 py-3 font-medium">Testnet address</th><th className="px-5 py-3 font-medium">Purpose</th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] bg-[#0C1118] text-xs">
                <AddressRow address="CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH" name="Soroswap router" purpose="Liquidity operations" />
                <AddressRow address="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" name="XLM SAC" purpose="Native asset contract" />
                <AddressRow address="CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU" name="USDC SAC" purpose="USDC asset contract" />
              </tbody>
            </table>
          </div>
        </section>

        <div className="mb-10 mt-14 flex flex-col gap-4 border-t border-white/[0.08] py-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-[#F0F0F0]">Explore Terminal8 on Stellar Testnet</p>
            <p className="mt-1 text-sm text-[#8D9BAD]">Connect a wallet, compare pools and review each transaction before signing.</p>
          </div>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#F2C12E] px-4 text-sm font-semibold text-[#0D0D12] transition hover:bg-[#FDE047]" onClick={onOpenDashboard} type="button">
            Open dashboard <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </main>
    </div>
  )
}

function StatusBadge({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-7 items-center gap-2 rounded-md border border-[#35D49A]/25 bg-[#35D49A]/10 px-2.5 text-[11px] font-medium text-[#35D49A]"><span className="size-1.5 rounded-full bg-[#35D49A]" />{children}</span>
}

function Feature({ children, icon: Icon, title }: { children: ReactNode; icon: LucideIcon; title: string }) {
  return <div className="border-b border-white/[0.07] py-5 sm:min-h-40 sm:border-r sm:px-5 sm:odd:pl-0 sm:even:border-r-0 sm:even:pr-0 sm:nth-last-[-n+2]:border-b-0"><Icon className="size-5 text-[#F2C12E]" strokeWidth={1.8} aria-hidden="true" /><p className="mt-4 text-sm font-medium text-[#F0F0F0]">{title}</p><p className="mt-2 text-[13px] leading-5 text-[#98A6B7]">{children}</p></div>
}

function Step({ children, number, title }: { children: ReactNode; number: string; title: string }) {
  return <div className="grid gap-2 py-4 sm:grid-cols-[48px_180px_1fr] sm:items-start"><span className="font-mono text-xs text-[#D9B73A]">{number}</span><p className="text-sm font-medium text-[#E8EDF4]">{title}</p><p className="text-[13px] leading-5 text-[#8F9DAF]">{children}</p></div>
}

function InfoBlock({ children, title }: { children: ReactNode; title: string }) {
  return <div className="bg-[#0C1118] p-5"><div className="flex items-center gap-2 text-sm font-medium text-[#F0F0F0]"><Check className="size-4 text-[#35D49A]" aria-hidden="true" />{title}</div><p className="mt-2 text-[13px] leading-6 text-[#98A6B7]">{children}</p></div>
}

function FlowRow({ children, endpoint, title }: { children: ReactNode; endpoint: string; title: string }) {
  return <div className="grid gap-3 rounded-lg border border-white/[0.07] bg-[#0C1118] p-4 sm:grid-cols-[180px_1fr] sm:items-start sm:p-5"><div><p className="text-sm font-medium text-[#F0F0F0]">{title}</p><code className="mt-1.5 block break-all font-mono text-[10px] leading-4 text-[#D9B73A]">{endpoint}</code></div><p className="text-[13px] leading-6 text-[#98A6B7]">{children}</p></div>
}

function MiniFeature({ children, title }: { children: ReactNode; title: string }) {
  return <div className="border-l border-white/[0.09] py-1 pl-4"><p className="text-sm font-medium text-[#E8EDF4]">{title}</p><p className="mt-2 text-[13px] leading-5 text-[#8F9DAF]">{children}</p></div>
}

function TechRow({ area, detail }: { area: string; detail: string }) {
  return <div className="grid gap-1 border-b border-white/[0.06] bg-[#0C1118] px-5 py-4 last:border-b-0 sm:grid-cols-[140px_1fr] sm:items-center"><p className="text-xs font-medium text-[#D9B73A]">{area}</p><p className="text-[13px] text-[#A5B1C2]">{detail}</p></div>
}

function ArchitectureNode({ children, title }: { children: ReactNode; title: string }) {
  return <div className="min-h-24 rounded-md border border-white/[0.07] bg-[#080B10] p-4"><p className="text-xs font-medium text-[#E8EDF4]">{title}</p><p className="mt-2 text-[11px] leading-5 text-[#7F8DA0]">{children}</p></div>
}

function AddressRow({ address, name, purpose }: { address: string; name: string; purpose: string }) {
  return <tr><td className="px-5 py-4 font-medium text-[#E8EDF4]">{name}</td><td className="px-5 py-4 font-mono text-[#9EABBC]">{address.slice(0, 10)}...{address.slice(-8)}</td><td className="px-5 py-4 text-[#8F9DAF]">{purpose}</td></tr>
}

function Code({ children }: { children: ReactNode }) {
  return <code className="mx-1 rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-xs text-[#D7DEE8]">{children}</code>
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-[#F2C12E]">{children}</p>
}

function DocsDivider() {
  return <hr className="my-14 border-white/[0.07]" />
}
