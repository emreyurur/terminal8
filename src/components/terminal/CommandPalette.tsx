import { useEffect, useRef, useState } from 'react'
import { availableCommands, runCommand, type CommandContext, type TerminalLine } from './commandRegistry'
import { TerminalStream } from './TerminalStream'

// ─── Command Palette (Cmd+K modal) ───────────────────────────────────────────

type CommandPaletteProps = {
  commandContext: CommandContext | null
  lines: TerminalLine[]
  open: boolean
  onClear: () => void
  onClose: () => void
  onSubmitLines: (lines: TerminalLine[]) => void
}

export function CommandPalette({ commandContext, lines, open, onClear, onClose, onSubmitLines }: CommandPaletteProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, open])

  const handleSubmit = async (event: { preventDefault(): void }) => {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    setInput('')

    if (trimmed.toLowerCase() === 'clear') {
      onClear()
      onClose()
      return
    }

    onSubmitLines([{ id: `cmd-${Date.now()}`, kind: 'command', text: trimmed }])
    if (commandContext) {
      await runCommand(trimmed, commandContext, (line) => onSubmitLines([line]))
    } else {
      onSubmitLines([{ id: `err-${Date.now()}`, kind: 'error', text: 'Terminal context not available.' }])
    }
    onClose()
  }

  if (!open) return null

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D0D12]/80 px-4 backdrop-blur-md"
      role="dialog"
    >
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <section className="relative w-full max-w-3xl overflow-hidden rounded-xl border border-white/[0.12] bg-[#12121A] text-[#F0F0F0] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#F2C12E]">Command Palette</p>
            <h2 className="mt-1 text-xl font-semibold">Stellar operations</h2>
          </div>
          <button
            aria-label="Close"
            className="rounded-md border border-white/[0.12] px-2.5 py-1 text-sm transition duration-150 hover:border-[#F2C12E]/70 hover:text-[#F2C12E]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <form className="border-b border-white/[0.08] p-5" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            autoComplete="off"
            className="w-full bg-transparent font-terminal text-xl text-[#F0F0F0] outline-none placeholder:text-[#9CA3AF]"
            onChange={(e) => setInput(e.target.value)}
            placeholder="pools · deposit 1 10 10 · withdraw 1 --full"
            value={input}
          />
        </form>
        <div className="grid gap-4 p-5">
          <TerminalStream className="max-h-72 min-h-56" lines={lines} />
          <div className="flex flex-wrap gap-2">
            {availableCommands.slice(0, 8).map((command) => (
              <button
                className="rounded-md border border-white/[0.12] px-3 py-1.5 font-terminal text-xs text-[#F0F0F0]/70 transition hover:border-[#F2C12E]/70 hover:text-[#F2C12E]"
                key={command}
                onClick={() => setInput(command.split(' ')[0] + (command.includes('<') ? ' ' : ''))}
                type="button"
              >
                {command}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Bottom Terminal ──────────────────────────────────────────────────────────

export function BottomTerminal({
  commandContext,
  lines,
  onClear,
  onClose,
  onOpen,
  onRunCommand,
  open,
}: {
  commandContext: CommandContext | null
  lines: TerminalLine[]
  onClear: () => void
  onClose: () => void
  onOpen: () => void
  onRunCommand: (lines: TerminalLine[]) => void
  open: boolean
}) {
  const [input, setInput] = useState('')
  const [executing, setExecuting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const handleSubmit = async (event: { preventDefault(): void }) => {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || executing) return

    setInput('')

    // Handle clear locally
    if (trimmed.toLowerCase() === 'clear') {
      onClear()
      return
    }

    // Echo the command
    onRunCommand([{ id: `cmd-${Date.now()}`, kind: 'command', text: trimmed }])

    if (!commandContext) {
      onRunCommand([{ id: `err-${Date.now()}`, kind: 'error', text: 'Terminal context not available.' }])
      return
    }

    setExecuting(true)
    try {
      await runCommand(
        trimmed,
        commandContext,
        (line) => onRunCommand([line]),
      )
    } finally {
      setExecuting(false)
    }
  }

  if (!open) {
    return (
      <button
        className="fixed inset-x-0 bottom-0 z-40 flex h-10 items-center justify-between border-t border-white/[0.12] bg-[#0D0D12] px-5 text-left text-sm text-[#F0F0F0] transition hover:bg-[#14141E] sm:px-8"
        onClick={onOpen}
        type="button"
      >
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#16A34A]" />
          Terminal
        </span>
        <span className="font-terminal text-xs text-[#9CA3AF]">Open</span>
      </button>
    )
  }

  return (
    <section className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.12] bg-[#0D0D12] text-[#F0F0F0] shadow-2xl">
      {/* Tab bar */}
      <div className="flex h-10 items-center justify-between border-b border-white/[0.08] px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <span className="border-t-2 border-[#F2C12E] px-1 pt-2 font-terminal text-xs font-semibold text-[#F0F0F0]">
            Terminal
          </span>
          {executing && (
            <span className="flex items-center gap-1.5 text-xs text-[#F2C12E]">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#F2C12E]" />
              executing…
            </span>
          )}
          {!executing && (
            <span className="hidden font-terminal text-xs text-[#9CA3AF] sm:inline">
              {commandContext?.status === 'CONNECTED'
                ? `${commandContext.positions.length} position${commandContext.positions.length !== 1 ? 's' : ''} open`
                : 'wallet not connected'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <kbd className="rounded border border-white/[0.12] px-2 py-1 font-terminal text-xs text-[#9CA3AF]">
            Cmd J
          </kbd>
          <button
            aria-label="Close terminal"
            className="rounded-md border border-white/[0.12] px-2.5 py-1 text-sm transition duration-150 hover:border-[#F2C12E]/70 hover:text-[#F2C12E]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      {/* Stream + input */}
      <div className="mx-auto grid max-w-[1440px] gap-3 px-4 py-3 sm:px-6">
        <TerminalStream className="h-52 sm:h-60" lines={lines} />
        <form
          className={`flex h-10 items-center gap-2 rounded-lg border bg-black/40 px-3 transition-colors duration-150 ${
            executing
              ? 'border-[#F2C12E]/25'
              : 'border-white/[0.12] focus-within:border-[#F2C12E]/35'
          }`}
          onSubmit={handleSubmit}
        >
          <span className={`font-terminal text-sm ${executing ? 'text-[#F2C12E]' : 'text-[#16A34A]'}`}>
            {executing ? '⟳' : '$'}
          </span>
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent font-terminal text-sm outline-none placeholder:text-[#9CA3AF]"
            disabled={executing}
            onChange={(e) => setInput(e.target.value)}
            placeholder={executing ? '' : 'pools · deposit 1 10 10 · withdraw 1 --full'}
            value={input}
          />
          {input && !executing && (
            <kbd className="shrink-0 rounded border border-white/[0.12] px-1.5 py-0.5 font-terminal text-[10px] text-[#9CA3AF]">
              ↵
            </kbd>
          )}
        </form>
      </div>
    </section>
  )
}
