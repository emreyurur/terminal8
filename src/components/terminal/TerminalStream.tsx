import { useEffect, useRef } from 'react'
import { ExternalLink } from 'lucide-react'
import type { TerminalLine } from './commandRegistry'

export function TerminalStream({
  className = 'h-64',
  lines,
}: {
  className?: string
  lines: TerminalLine[]
}) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div
      className={`${className} terminal-scroll font-terminal overflow-y-auto rounded-lg border border-white/[0.12] bg-black/40 p-4 text-sm`}
    >
      <div className="space-y-2">
        {lines.map((line) => {
          if (line.kind === 'help') {
            return <HelpBlock key={line.id} />
          }

          if (line.kind === 'transaction') {
            return (
              <a
                aria-label={`Open transaction ${line.hash} in Stellar Explorer`}
                className="group flex min-w-0 items-start gap-2.5 rounded-md border border-[#35D49A]/20 bg-[#35D49A]/[0.06] px-3 py-2 text-[#35D49A] transition hover:border-[#35D49A]/40 hover:bg-[#35D49A]/[0.1]"
                href={line.href}
                key={line.id}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[10px] font-medium uppercase text-[#82958E]">Transaction</span>
                  <span className="block break-all font-mono text-xs leading-5 underline decoration-[#35D49A]/30 underline-offset-2 group-hover:decoration-[#35D49A]">
                    {line.hash}
                  </span>
                </span>
              </a>
            )
          }

          const prefix =
            line.kind === 'command'
              ? '>'
              : line.kind === 'success'
                ? '✓'
                : line.kind === 'error'
                  ? '✗'
                  : '·'

          const textColor =
            line.kind === 'success'
              ? 'text-[#16A34A]'
              : line.kind === 'error'
                ? 'text-red-400'
                : line.kind === 'command'
                  ? 'text-[#F2C12E]'
                  : 'text-[#F0F0F0]/80'

          return (
            <div className="flex gap-2.5" key={line.id}>
              <span className={`shrink-0 select-none opacity-60 ${textColor}`}>{prefix}</span>
              <p className={textColor}>{line.text}</p>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
    </div>
  )
}

function HelpBlock() {
  const groups = [
    {
      label: 'Pools',
      cmds: [
        { cmd: 'pools', desc: 'List live pools with selection numbers' },
        { cmd: 'pool <number>', desc: 'Show pool details and full pool ID' },
      ],
    },
    {
      label: 'Positions',
      cmds: [
        { cmd: 'positions', desc: 'List active wallet positions' },
        { cmd: 'position <number>', desc: 'Inspect one position' },
        { cmd: 'deposit <pool-number|pool-id> <amount-a> [amount-b]', desc: 'Build and sign a pool deposit' },
        { cmd: 'withdraw <position> [amount|--full]', desc: 'Build and sign a position withdrawal' },
      ],
    },
    {
      label: 'Wallet',
      cmds: [
        { cmd: 'balance', desc: 'Show XLM and USDC balances' },
        { cmd: 'whoami', desc: 'Show connected wallet address' },
        { cmd: 'network', desc: 'Show network and RPC info' },
      ],
    },
    {
      label: 'Terminal',
      cmds: [
        { cmd: 'help', desc: 'Show this help message' },
        { cmd: 'clear', desc: 'Clear terminal output' },
      ],
    },
  ]

  return (
    <div className="space-y-3 rounded-lg border border-[#F2C12E]/25 bg-[#F2C12E]/10 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#F2C12E]">
        Command Reference
      </p>
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-[#9CA3AF]">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.cmds.map(({ cmd, desc }) => (
              <div className="flex items-baseline gap-3" key={cmd}>
                <code className="w-44 shrink-0 rounded bg-[#12121A] px-2 py-0.5 text-xs text-[#F2C12E]">
                  {cmd}
                </code>
                <span className="text-xs text-[#9CA3AF]">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
