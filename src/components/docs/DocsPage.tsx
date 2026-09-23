import { useEffect, useState, type ReactNode } from 'react'
import { POOL_VOTING_CONTRACT_ID } from '../../services/poolVotingContract'

// ─── Nav config ───────────────────────────────────────────────────────────────

const navSections = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'architecture', label: 'Technology Stack & Architecture' },
    ],
  },
  {
    id: 'core-features',
    label: 'Core Features',
    items: [
      { id: 'pools', label: 'DeFi Pools & LP' },
      { id: 'contracts', label: 'Soroban Contracts Reference', badge: 'NEW' },
    ],
  },
]

const pageSections = navSections.flatMap((section) => section.items)

// ─── Page ────────────────────────────────────────────────────────────────────

export function DocsPage() {
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
    <div className="terminal8-docs mx-auto grid w-full max-w-[1360px] grid-cols-1 gap-0 py-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:py-9 xl:grid-cols-[210px_minmax(0,780px)_170px] xl:gap-8">
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
      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside className="hidden border-r border-white/[0.07] lg:block">
        <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pr-6">
          {navSections.map((section) => (
            <div className="mb-7" key={section.id}>
              <p className="mb-2 px-3 text-[11px] font-medium text-[#718096]">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <button
                    className={`relative flex min-h-9 w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] transition ${
                      activeSection === item.id
                        ? 'bg-white/[0.045] font-medium text-white before:absolute before:inset-y-2 before:left-0 before:w-px before:bg-[#F2C12E]'
                        : 'font-normal text-[#98A6B7] hover:bg-white/[0.03] hover:text-white'
                    }`}
                    key={item.id}
                    onClick={() => scrollTo(item.id)}
                    type="button"
                  >
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="rounded border border-[#F2C12E]/20 bg-[#F2C12E]/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-[#F2C12E]">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-8 border-t border-white/[0.07] px-3 pt-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#718096]">
                System Status
              </span>
              <span className="flex size-1.5 rounded-full bg-[#35D49A]" />
            </div>
            <p className="mt-2 font-mono text-xs font-medium text-[#D7DEE8]">v0.1.0-testnet</p>
            <p className="mt-1 text-[11px] leading-4 text-[#718096]">Stellar Soroban & Horizon API</p>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="min-w-0 lg:px-8 xl:px-0">
        {/* ── Overview ───────────────────────────────────────────────────── */}
        <section className="scroll-mt-28 pt-1" id="overview">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusBadge status="live">v0.1 — Live on Stellar Testnet</StatusBadge>
            <span className="font-mono text-xs text-[#9CA3AF]">Soroban AMM · Horizon API</span>
          </div>

          <h1 className="mt-5 text-3xl font-medium leading-tight text-white sm:text-4xl">
            Terminal8 Architecture & Docs
          </h1>
          <p className="mt-4 max-w-[720px] text-[15px] leading-7 text-[#98A6B7]">
            Terminal8 is a non-custodial DeFi dashboard and automated liquidity management platform built on the Stellar network and Soroban smart contracts. Developers and liquidity providers get unified access to constant-product AMM pools, risk-adjusted yield scoring, and instant transaction signing via Freighter.
          </p>

          <div className="mt-10 grid border-y border-white/[0.07] sm:grid-cols-3 sm:divide-x sm:divide-white/[0.07]">
            <FeatureCard
              icon={
                <svg className="size-5 text-[#F2C12E]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
              title="Instant LP Operations"
            >
              Deposit and withdraw liquidity shares directly into Soroswap AMM pools (`AST1/AST2`, `XLM/USDC`) with automated XDR envelope construction.
            </FeatureCard>
            <FeatureCard
              icon={
                <svg className="size-5 text-[#4ade80]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              }
              title="Pool Trust Oracle"
            >
              Deterministic 4-axis reputation evaluation scoring every pool across Liquidity Depth (40pt), Protocol Age (20pt), Security Audit (20pt), and Volume (20pt).
            </FeatureCard>
            <FeatureCard
              icon={
                <svg className="size-5 text-[#60A5FA]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C19.496 3 20 3.504 20 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                  />
                </svg>
              }
              title="Portfolio & APY Sync"
            >
              Real-time synchronization between local storage state and remote Horizon portfolio indexes (`/api/v1/portfolio/sync`) for accurate yield tracking.
            </FeatureCard>
          </div>
        </section>

        <DocsDivider />

        {/* ── Architecture & Technology Stack ───────────────────────────── */}
        <section className="scroll-mt-28" id="architecture">
          <SectionLabel>Technology Stack & Architecture</SectionLabel>
          <h2 className="mt-2 text-2xl font-medium text-[#F0F0F0]">Full-Stack Architecture (Frontend & Backend)</h2>
          <p className="mt-3 text-sm leading-6 text-[#98A6B7]">
            Terminal8 combines a high-performance React 19 + Vite frontend dashboard with an enterprise-grade NestJS backend API that orchestrates Soroban RPC and Horizon endpoints with strict type safety and real-time indexing.
          </p>

          {/* Frontend Tech Stack Grid */}
          <div className="mt-7 overflow-hidden rounded-lg border border-white/[0.07] bg-[#0C1118]">
            <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#101720] px-5 py-3">
              <p className="font-mono text-xs font-semibold text-[#60A5FA]">// frontend-client-stack.ts</p>
              <span className="rounded bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 font-mono text-[10px] text-blue-400 font-bold">Client Layer</span>
            </div>
            <div className="grid divide-y divide-white/[0.08] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              {[
                {
                  layer: 'UI Framework',
                  name: 'React 19 & Vite v6.0',
                  desc: 'Concurrent Rendering · Hot Module Replacement · Ultra-fast Build Pipeline',
                  color: 'text-[#60A5FA]',
                },
                {
                  layer: 'Type & State',
                  name: 'Strict TypeScript v5.6+',
                  desc: 'Zero-runtime Type Errors · Custom Dashboard Hooks · Strict DTO Alignment',
                  color: 'text-[#F2C12E]',
                },
                {
                  layer: 'Design & Styling',
                  name: 'Tailwind CSS v3.4',
                  desc: 'Utility-first Responsive Grid · Glassmorphism · Curated Dark Mode Aesthetics',
                  color: 'text-purple-400',
                },
                {
                  layer: 'Wallet & XDR',
                  name: 'Stellar Wallets Kit & Freighter',
                  desc: 'Multi-wallet Support · Cryptographic Challenge Signing · XDR Verification',
                  color: 'text-[#4ade80]',
                },
              ].map((item) => (
                <div className="p-5" key={item.layer}>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF]">
                    {item.layer}
                  </p>
                  <p className={`mt-2 text-sm font-bold ${item.color}`}>{item.name}</p>
                  <p className="mt-1.5 font-mono text-xs leading-5 text-[#9CA3AF]">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-white/[0.07] bg-[#0C1118] p-5">
              <h3 className="flex items-center gap-2 text-sm font-medium text-[#F0F0F0]">
                <span className="size-2 rounded-full bg-[#60A5FA]" />
                Frontend Core & UI Architecture
              </h3>
              <p className="mt-2 text-xs leading-6 text-[#9CA3AF]">
                <strong>React 19 & Vite:</strong> Delivers instantaneous UI feedback, custom hooks (`usePoolDashboard`, `usePortfolioDashboard`, `WalletContext`), and seamless component tree reconciliation.<br/>
                <strong>Tailwind CSS & Recharts:</strong> Styled with custom glassmorphism (`backdrop-blur`), vibrant neon gradients, and interactive APY trend charts.
              </p>
            </div>

            <div className="rounded-lg border border-white/[0.07] bg-[#0C1118] p-5">
              <h3 className="flex items-center gap-2 text-sm font-medium text-[#F0F0F0]">
                <span className="size-2 rounded-full bg-[#4ade80]" />
                Wallet Integration & CLI Terminal
              </h3>
              <p className="mt-2 text-xs leading-6 text-[#9CA3AF]">
                <strong>Stellar Wallets Kit:</strong> Connects to **Freighter, xBull, LOBSTR, and Albedo** with automated challenge authorization (`signAuthEntry`).<br/>
                <strong>Developer CLI Terminal:</strong> Embedded command suite (`positions`, `withdraw`, `pools`, `balance`) allowing power users to sign real XDR envelopes directly via command prompt.
              </p>
            </div>
          </div>

          {/* Backend Tech Stack Grid */}
          <div className="mt-8 overflow-hidden rounded-lg border border-white/[0.07] bg-[#0C1118]">
            <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#101720] px-5 py-3">
              <p className="font-mono text-xs font-semibold text-[#F2C12E]">// system-architecture.ts & backend-stack</p>
              <span className="rounded bg-[#F2C12E]/10 border border-[#F2C12E]/20 px-2 py-0.5 font-mono text-[10px] text-[#F2C12E] font-bold">API Layer</span>
            </div>
            <div className="grid divide-y divide-white/[0.08] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              {[
                {
                  layer: 'Core Framework',
                  name: 'NestJS & Node v20+',
                  desc: 'Modular Architecture · Dependency Injection · RO-RO Pattern · Asynchronous Non-blocking I/O',
                  color: 'text-[#F2C12E]',
                },
                {
                  layer: 'Blockchain Layer',
                  name: '@stellar/stellar-sdk v12.3',
                  desc: 'XDR TransactionBuilder · Horizon API Integration · Indexer Mechanism · getLiquidityPoolId',
                  color: 'text-blue-400',
                },
                {
                  layer: 'Database & ORM',
                  name: 'PostgreSQL v16 & TypeORM',
                  desc: 'ACID Transaction History · Isolated Data Access Layer via @Entity and Repository Pattern',
                  color: 'text-purple-400',
                },
                {
                  layer: 'Queue & Caching',
                  name: 'Redis v7 & BullMQ v5.7',
                  desc: 'Cache Manager ioredis Adapter · Asynchronous Workers · CRON-based Retry Mechanism',
                  color: 'text-[#4ade80]',
                },
              ].map((item) => (
                <div className="p-5" key={item.layer}>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF]">
                    {item.layer}
                  </p>
                  <p className={`mt-2 text-sm font-bold ${item.color}`}>{item.name}</p>
                  <p className="mt-1.5 font-mono text-xs leading-5 text-[#9CA3AF]">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-white/[0.07] bg-[#0C1118] p-5">
              <h3 className="flex items-center gap-2 text-sm font-medium text-[#F0F0F0]">
                <span className="size-2 rounded-full bg-[#F2C12E]" />
                1. Core Framework & Language
              </h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-3 font-mono text-xs text-[#CBD5E1]">
                <div className="border-l border-white/[0.09] py-1 pl-4">
                  <p className="font-bold text-white mb-1">Node.js (v20+) & V8 Engine</p>
                  <p className="text-[#9CA3AF] text-[11px] leading-5">Asynchronous non-blocking I/O architecture processes intensive Horizon network requests without bottlenecks.</p>
                </div>
                <div className="border-l border-white/[0.09] py-1 pl-4">
                  <p className="font-bold text-white mb-1">TypeScript (v5.1)</p>
                  <p className="text-[#9CA3AF] text-[11px] leading-5">Strict mode enabled across all layers, avoiding `any` types and guaranteeing zero compile-time type errors.</p>
                </div>
                <div className="border-l border-white/[0.09] py-1 pl-4">
                  <p className="font-bold text-white mb-1">NestJS (v10.0)</p>
                  <p className="text-[#9CA3AF] text-[11px] leading-5">Modular domain structure (`HistoryModule`, `TestnetToolsModule`) utilizing strict DI and clean architectural patterns.</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.07] bg-[#0C1118] p-5">
              <h3 className="flex items-center gap-2 text-sm font-medium text-[#F0F0F0]">
                <span className="size-2 rounded-full bg-blue-400" />
                2. Blockchain & Stellar Integration (@stellar/stellar-sdk v12.3)
              </h3>
              <p className="mt-2 text-xs leading-6 text-[#9CA3AF]">
                Core library providing full integration with the Stellar network. Smart contract logic, LP operations, trustlines, and token transfers are built on the backend (`TransactionBuilder`) and delivered to the client as XDR envelopes for Freighter wallet signing.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px]">
                <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-blue-300">Horizon API Integration</span>
                <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-blue-300">XDR Envelope Construction</span>
                <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-blue-300">Asynchronous Horizon Indexer</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-white/[0.07] bg-[#0C1118] p-5">
                <h3 className="flex items-center gap-2 text-sm font-medium text-[#F0F0F0]">
                  <span className="size-2 rounded-full bg-purple-400" />
                  3. Database & ORM Layer
                </h3>
                <p className="mt-2 text-xs leading-6 text-[#9CA3AF]">
                  <strong>PostgreSQL (v16 Alpine):</strong> ACID-compliant persistent storage for user transaction records (`History`), profile metadata, and financial activity logs.<br/>
                  <strong>TypeORM (v0.3.20):</strong> Strictly typed `@Entity` and `@Column` classes isolating database access (`@InjectRepository`) from business logic.
                </p>
              </div>

              <div className="rounded-lg border border-white/[0.07] bg-[#0C1118] p-5">
                <h3 className="flex items-center gap-2 text-sm font-medium text-[#F0F0F0]">
                  <span className="size-2 rounded-full bg-[#4ade80]" />
                  4. Caching & Queue Engine (Redis & BullMQ)
                </h3>
                <p className="mt-2 text-xs leading-6 text-[#9CA3AF]">
                  <strong>Redis (v7) & ioredis:</strong> Caches high-frequency Horizon API queries via `@nestjs/cache-manager` and `cache-manager-ioredis-yet` adapter.<br/>
                  <strong>BullMQ (v5.7):</strong> Manages CRON-based indexer synchronization and background workers with automated retry mechanisms.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ArchBlock badge="Security & Validations" title="JWT, Class Validator & Joi">
                Stateless authentication via `@nestjs/jwt` & `passport-jwt`. Requests are validated using `Class Validator` (`@IsString()`, `@IsNotEmpty()`), while `Joi` verifies required environment variables (`.env`) on application startup.
              </ArchBlock>
              <ArchBlock badge="DevOps & QA" title="Docker, Swagger & Jest">
                Containerized deployment (`docker-compose up -d`) orchestrates PostgreSQL, Redis, and API services in an isolated network. Live OpenAPI 3.0 specs are published at `/api/v1/docs`, backed by comprehensive `Jest` and `Supertest` suites.
              </ArchBlock>
            </div>
          </div>
        </section>

        <DocsDivider />

        {/* ── Pools & LP ─────────────────────────────────────────────────── */}
        <section className="scroll-mt-28" id="pools">
          <SectionLabel>Core Features</SectionLabel>
          <h2 className="mt-2 text-2xl font-medium text-[#F0F0F0]">DeFi Pools & LP Operations</h2>
          <p className="mt-3 text-sm leading-6 text-[#98A6B7]">
            Terminal8 prioritizes deep liquidity pools (`constant_product`) with instant deposit/withdraw capabilities and real-time shares tracking.
          </p>

          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-white/[0.07] bg-[#0C1118] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-[#F0F0F0]">Constant Product AMM Mechanics</h3>
                <span className="rounded-full border border-[#4ade80]/30 bg-[#4ade80]/15 px-3 py-1 font-mono text-xs font-semibold text-[#4ade80]">
                  Active
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#9CA3AF]">
                When depositing into a pool (e.g. `AST1 / AST2` or `XLM / USDC`), the protocol automatically calculates the proportional asset reserves and issues LP shares (`totalShares`). Users earn transaction fees (`feeBp: 30`) proportional to their share of the pool.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 border-t border-white/[0.07] pt-4 font-mono text-xs text-[#CBD5E1]">
                <div><span className="text-[#9CA3AF]">Asset A Code:</span> AST1 / XLM</div>
                <div><span className="text-[#9CA3AF]">Asset B Code:</span> AST2 / USDC</div>
                <div><span className="text-[#9CA3AF]">Fee Basis Points:</span> 30 bps (0.30%)</div>
              </div>
            </div>
          </div>
        </section>

        <DocsDivider />

        {/* ── Deployed Contracts Reference ───────────────────────────── */}
        <section className="scroll-mt-28" id="contracts">
          <SectionLabel>Contract Reference</SectionLabel>
          <h2 className="mt-2 text-2xl font-medium text-[#F0F0F0]">Soroban Deployed Contracts</h2>
          <p className="mt-3 text-sm leading-6 text-[#98A6B7]">
            Terminal8 smart contracts run directly on <code className="font-mono text-xs text-[#F2C12E]">Test SDF Network ; September 2015</code> with persistent on-chain state storage.
          </p>

          {/* Featured PoolVotingContract Card */}
          <div className="mt-7 rounded-lg border border-[#F2C12E]/25 bg-[#0C1118] p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="rounded-md border border-[#F2C12E]/40 bg-[#F2C12E]/15 px-2.5 py-1 font-mono text-[11px] font-bold text-[#F2C12E]">
                    Soroban Persistent Storage
                  </span>
                  <h3 className="text-lg font-medium text-white">PoolVotingContract</h3>
                  <StatusBadge status="live">Active on Testnet</StatusBadge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#9CA3AF]">
                  Stores on-chain upvote/downvote aggregate scores (<code className="font-mono text-xs text-[#CBD5E1]">Score(Address)</code>) and a master pool discovery list (<code className="font-mono text-xs text-[#CBD5E1]">PoolList</code>) on Stellar Soroban with automatic 30-day TTL extension.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-[#CBD5E1]">
                  <span className="text-[#9CA3AF]">Contract Address:</span>
                  <code className="rounded bg-[#1E1E2E] px-2.5 py-1 text-[#F2C12E] select-all">{POOL_VOTING_CONTRACT_ID}</code>
                </div>
              </div>
              <a
                href={`https://stellar.expert/explorer/testnet/contract/${POOL_VOTING_CONTRACT_ID}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-[#F2C12E] px-4 font-mono text-xs font-semibold text-[#0D0D12] transition hover:bg-[#FDE047]"
              >
                <span>View on Stellar Explorer ↗</span>
                <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-white/[0.07] bg-[#0C1118]">
            <table className="min-w-[680px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] bg-[#101720]">
                  {['Contract Name', 'Contract Address / Explorer Link', 'Network', 'Status'].map((h) => (
                    <th
                      className="px-6 py-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#9CA3AF]"
                      key={h}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-mono text-xs">
                {[
                  {
                    name: 'PoolVotingContract',
                    addr: POOL_VOTING_CONTRACT_ID,
                    network: 'Testnet',
                    status: 'live' as const,
                  },
                  {
                    name: 'Soroswap AMM Router',
                    addr: 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH',
                    network: 'Testnet',
                    status: 'live' as const,
                  },
                  {
                    name: 'XLM Asset SAC',
                    addr: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                    network: 'Testnet',
                    status: 'live' as const,
                  },
                  {
                    name: 'USDC Asset SAC',
                    addr: 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU',
                    network: 'Testnet',
                    status: 'live' as const,
                  },
                ].map((row, i) => (
                  <tr className="transition-colors hover:bg-white/[0.03]" key={i}>
                    <td className="px-6 py-4 font-semibold text-[#F0F0F0]">{row.name}</td>
                    <td className="px-6 py-4">
                      <a
                        href={`https://stellar.expert/explorer/testnet/contract/${row.addr}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-[#60A5FA] hover:text-[#F2C12E] hover:underline transition"
                        title="Open in Stellar Explorer"
                      >
                        <span>{row.addr.slice(0, 10)}...{row.addr.slice(-8)}</span>
                        <svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    </td>
                    <td className="px-6 py-4 text-[#CBD5E1]">{row.network}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={row.status}>Live</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Footer CTA ─────────────────────────────────────────────────── */}
        <div className="mb-10 mt-14 border-t border-white/[0.08] py-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-[#F0F0F0]">Ready to test live pool operations?</p>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                Connect your wallet on the Home tab or use the API Tester to inspect raw XDR envelopes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[#F2C12E] px-4 text-sm font-semibold text-[#0D0D12] transition hover:bg-[#FDE047]"
                href="#"
              >
                <span>Launch Dashboard</span>
                <svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={3.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </main>

      <aside className="hidden xl:block">
        <div className="sticky top-28 border-l border-white/[0.07] pl-5">
          <p className="mb-3 text-xs font-medium text-[#D7DEE8]">On this page</p>
          <nav className="space-y-1" aria-label="On this page">
            {pageSections.map((item) => (
              <button
                className={`block w-full py-1.5 text-left text-xs leading-4 transition ${
                  activeSection === item.id ? 'text-[#F2C12E]' : 'text-[#718096] hover:text-[#D7DEE8]'
                }`}
                key={item.id}
                onClick={() => scrollTo(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>
    </div>
  )
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatusBadge({
  children,
  status,
}: {
  children: ReactNode
  status: 'live' | 'in-progress' | 'planned'
}) {
  const styles = {
    live: 'border-[#4ade80]/30 bg-[#4ade80]/15 text-[#4ade80]',
    'in-progress': 'border-[#F2C12E]/30 bg-[#F2C12E]/15 text-[#F2C12E]',
    planned: 'border-white/[0.12] bg-white/[0.06] text-[#9CA3AF]',
  }
  const dots = {
    live: 'bg-[#4ade80]',
    'in-progress': 'bg-[#F2C12E]',
    planned: 'bg-[#9CA3AF]',
  }
  return (
    <span
      className={`inline-flex h-7 items-center gap-2 rounded-md border px-2.5 font-mono text-[11px] font-medium ${styles[status]}`}
    >
      <span className={`size-1.5 rounded-full ${dots[status]}`} />
      {children}
    </span>
  )
}

function FeatureCard({
  children,
  icon,
  title,
}: {
  children: ReactNode
  icon: ReactNode
  title: string
}) {
  return (
    <div className="border-b border-white/[0.07] py-5 sm:border-b-0 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <div className="mb-4 flex size-8 items-center justify-center rounded-md bg-white/[0.045]">
        {icon}
      </div>
      <p className="text-sm font-medium text-[#F0F0F0]">{title}</p>
      <p className="mt-2 text-[13px] leading-5 text-[#98A6B7]">{children}</p>
    </div>
  )
}

function ArchBlock({
  badge,
  children,
  title,
}: {
  badge: string
  children: ReactNode
  title: string
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-[#0C1118] p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#F0F0F0]">{title}</p>
        <span className="rounded border border-[#F2C12E]/20 bg-[#F2C12E]/[0.06] px-2 py-0.5 font-mono text-[10px] font-medium text-[#F2C12E]">
          {badge}
        </span>
      </div>
      <p className="mt-2.5 text-[13px] leading-6 text-[#98A6B7]">{children}</p>
    </div>
  )
}


function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium text-[#F2C12E]">{children}</p>
  )
}

function DocsDivider() {
  return <hr className="my-14 border-white/[0.07]" />
}
