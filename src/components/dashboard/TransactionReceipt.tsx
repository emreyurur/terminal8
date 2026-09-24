import { useState } from 'react'
import { Check, CheckCircle2, Copy, ExternalLink } from 'lucide-react'

export function TransactionReceipt({
  hash,
  subtitle = 'Your position is now active.',
  title = 'Deposit confirmed',
}: {
  hash: string
  subtitle?: string
  title?: string
}) {
  const [copied, setCopied] = useState(false)
  const shortHash = hash.length > 20 ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : hash

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(hash)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-[#35D49A]/25 bg-[#0C1513]">
      <div className="flex items-start gap-3 px-4 py-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#35D49A]/10 text-[#35D49A]">
          <CheckCircle2 size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-white">{title}</p>
            <span className="rounded border border-[#35D49A]/20 bg-[#35D49A]/[0.06] px-2 py-1 text-[10px] font-medium text-[#35D49A]">
              Confirmed
            </span>
          </div>
          <p className="mt-1 text-xs text-[#98A6B7]">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-white/[0.07] bg-black/10 px-4 py-3">
        <span className="text-[11px] text-[#718096]">Transaction</span>
        <code className="min-w-0 flex-1 truncate text-right text-[11px] text-[#D7DEE8]" title={hash}>{shortHash}</code>
        <button
          aria-label={copied ? 'Transaction ID copied' : 'Copy transaction ID'}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[#718096] transition hover:bg-white/[0.06] hover:text-white"
          onClick={() => void copyHash()}
          title={copied ? 'Copied' : 'Copy transaction ID'}
          type="button"
        >
          {copied ? <Check size={14} className="text-[#35D49A]" /> : <Copy size={14} />}
        </button>
        <a
          aria-label="View transaction on Stellar Expert"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[#718096] transition hover:bg-white/[0.06] hover:text-white"
          href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
          rel="noreferrer"
          target="_blank"
          title="View on Stellar Expert"
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  )
}
