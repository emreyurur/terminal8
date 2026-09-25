import { signTransaction } from '@stellar/freighter-api'
import { computeWithdrawShares } from '../../lib/lpShares'
import { executeApiPoolTransaction, getOnChainLpShares } from '../../services/terminal8Api'
import type { DeFiPool, LocalPosition } from '../../types/stellar'

export type TerminalLine =
  | { id: string; kind: 'log' | 'success' | 'error' | 'command'; text: string }
  | { id: string; kind: 'help' }
  | { id: string; kind: 'transaction'; hash: string; href: string }

export type CommandContext = {
  networkPassphrase: string | null
  networkUrl: string | null
  pools: DeFiPool[]
  positions: LocalPosition[]
  publicKey: string | null
  status: string
  xlmBalance: number
  usdcBalance: number
  onPositionAdded: (position: Omit<LocalPosition, 'id'>) => void
  onWithdrawn: (id: string, amount: number) => void
}

type Emit = (line: TerminalLine) => void
type Handler = (args: string[], ctx: CommandContext, emit: Emit) => void | Promise<void>

const uid = () => `l-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`
const log = (text: string, emit: Emit) => emit({ id: uid(), kind: 'log', text })
const ok = (text: string, emit: Emit) => emit({ id: uid(), kind: 'success', text })
const err = (text: string, emit: Emit) => emit({ id: uid(), kind: 'error', text })
const transaction = (hash: string, emit: Emit) => emit({
  id: uid(),
  kind: 'transaction',
  hash,
  href: `https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(hash)}`,
})

function pad(value: string, width: number) {
  const text = String(value)
  return text.length >= width ? `${text.slice(0, width - 1)}…` : text.padEnd(width)
}

function formatElapsed(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function resolvePool(selector: string | undefined, pools: DeFiPool[]): DeFiPool | undefined {
  if (!selector) return undefined
  const index = Number(selector) - 1
  if (Number.isInteger(index) && index >= 0) return pools[index]
  const normalized = selector.toLowerCase()
  return pools.find((pool) => pool.id.toLowerCase() === normalized)
}

const commands: Record<string, Handler> = {
  help: (_, __, emit) => {
    emit({ id: uid(), kind: 'help' })
  },

  positions: (_, ctx, emit) => {
    if (ctx.status !== 'CONNECTED') {
      err('Wallet not connected. Use the Connect button in the header.', emit)
      return
    }
    if (ctx.positions.length === 0) {
      log('No active positions. Open a vault from the Home screen.', emit)
      return
    }

    log(`  ${pad('#', 3)}${pad('Protocol', 20)}${pad('Asset', 9)}${pad('Supplied', 12)}${pad('APY', 8)}${pad('Earned', 13)}Age`, emit)
    log(`  ${'─'.repeat(72)}`, emit)
    ctx.positions.forEach((position, index) => {
      const earned = Number.isFinite(position.pnlUsd) ? `+$${Number(position.pnlUsd).toFixed(4)}` : '--'
      ok(
        `  ${pad(String(index + 1), 3)}${pad(position.protocol, 20)}${pad(position.asset, 9)}${pad(position.amount.toFixed(2), 12)}${pad(`${position.apy.toFixed(2)}%`, 8)}${pad(earned, 13)}${formatElapsed(Date.now() - position.openedAt)}`,
        emit,
      )
    })
  },

  position: ([number], ctx, emit) => {
    const index = Number(number) - 1
    if (!number || !Number.isInteger(index) || index < 0) {
      err('Usage: position <number>', emit)
      return
    }
    if (ctx.status !== 'CONNECTED') {
      err('Wallet not connected. Use the Connect button in the header.', emit)
      return
    }

    const position = ctx.positions[index]
    if (!position) {
      err(`Position #${number} was not found. Run: positions`, emit)
      return
    }

    log(`  Protocol   ${position.protocol}`, emit)
    log(`  Category   ${position.category}`, emit)
    log(`  Pool       ${position.poolId}`, emit)
    log(`  Supplied   ${position.amount.toFixed(2)} ${position.asset}`, emit)
    log(`  APY        ${position.apy.toFixed(2)}%`, emit)
    ok(`  Earned     ${Number.isFinite(position.pnlUsd) ? `+$${Number(position.pnlUsd).toFixed(4)}` : 'Unavailable'}`, emit)
    log(`  Age        ${formatElapsed(Date.now() - position.openedAt)}`, emit)
    log(`  Status     ${position.status}`, emit)
    log(`  TX         ${position.hash || 'Unavailable'}`, emit)
  },

  pools: (_, ctx, emit) => {
    if (ctx.pools.length === 0) {
      log('No live pools are available from the Terminal8 API.', emit)
      return
    }
    log(`  ${pad('#', 4)}${pad('Pair', 18)}${pad('Protocol', 20)}${pad('APY', 9)}${pad('Deposits', 12)}Pool ID`, emit)
    log(`  ${'─'.repeat(78)}`, emit)
    ctx.pools.forEach((pool, index) => {
      const pair = pool.secondaryAsset ? `${pool.asset}/${pool.secondaryAsset}` : pool.asset
      const shortId = pool.id.length > 18 ? `${pool.id.slice(0, 9)}…${pool.id.slice(-7)}` : pool.id
      ok(`  ${pad(String(index + 1), 4)}${pad(pair, 18)}${pad(pool.protocol, 20)}${pad(`${pool.apy.toFixed(2)}%`, 9)}${pad(pool.tvl, 12)}${shortId}`, emit)
    })
    log('Use: pool <number> for the full ID, or deposit <number> <amount-a> [amount-b].', emit)
  },

  pool: ([selector], ctx, emit) => {
    const pool = resolvePool(selector, ctx.pools)
    if (!pool) {
      err('Pool not found. Run: pools', emit)
      return
    }
    log(`  Pair       ${pool.asset}${pool.secondaryAsset ? ` / ${pool.secondaryAsset}` : ''}`, emit)
    log(`  Protocol   ${pool.protocol}`, emit)
    log(`  Category   ${pool.category}`, emit)
    log(`  APY        ${pool.apy.toFixed(2)}%`, emit)
    log(`  Deposits   ${pool.tvl}`, emit)
    ok(`  Pool ID    ${pool.id}`, emit)
  },

  deposit: async ([poolSelector, amountAText, amountBText = '0'], ctx, emit) => {
    const amountA = Number(amountAText)
    const amountB = Number(amountBText)
    const pool = resolvePool(poolSelector, ctx.pools)
    if (!poolSelector || !amountAText || !(amountA > 0) || !(amountB >= 0)) {
      err('Usage: deposit <pool-number|pool-id> <amount-a> [amount-b]', emit)
      return
    }
    if (!pool) {
      err('Pool not found. Run: pools', emit)
      return
    }
    if (!ctx.publicKey || !ctx.networkPassphrase || ctx.status !== 'CONNECTED') {
      err('Wallet not connected. Use the Connect button in the header.', emit)
      return
    }
    if (!ctx.networkPassphrase.toLowerCase().includes('test')) {
      err('Switch the connected wallet to Stellar Testnet.', emit)
      return
    }

    log(`Preparing ${pool.asset}${pool.secondaryAsset ? ` / ${pool.secondaryAsset}` : ''} deposit...`, emit)
    log('Review and approve the transaction in your wallet.', emit)

    try {
      const result = await executeApiPoolTransaction({
        publicKey: ctx.publicKey,
        signTransactionFn: signTransaction,
        params: {
          poolId: pool.id,
          action: 'DEPOSIT',
          amountA,
          amountB,
          shareAmount: 0,
          slippageBps: 50,
          userAddress: ctx.publicKey,
        },
      })
      ctx.onPositionAdded({
        amount: amountA,
        asset: pool.asset,
        hash: result.hash,
        protocol: pool.protocol,
        status: result.status,
        timestamp: new Date().toLocaleTimeString(),
        openedAt: Date.now(),
        apy: pool.apy,
        category: pool.category,
        poolId: pool.id,
      })
      ok('Deposit confirmed and portfolio sync requested.', emit)
      transaction(result.hash, emit)
    } catch (error) {
      err(error instanceof Error ? error.message : 'Deposit failed.', emit)
    }
  },

  withdraw: async ([number, amountText = '--full'], ctx, emit) => {
    const index = Number(number) - 1
    if (!number || !Number.isInteger(index) || index < 0) {
      err('Usage: withdraw <position> [amount|--full]', emit)
      return
    }
    const position = ctx.positions[index]
    if (!position) {
      err(`Position #${number} was not found. Run: positions`, emit)
      return
    }
    if (!ctx.publicKey || !ctx.networkUrl || !ctx.networkPassphrase || ctx.status !== 'CONNECTED') {
      err('Wallet not connected. Use the Connect button in the header.', emit)
      return
    }
    if (!ctx.networkPassphrase.toLowerCase().includes('test')) {
      err('Switch the connected wallet to Stellar Testnet.', emit)
      return
    }

    const fullWithdrawal = amountText === '--full'
    const requestedAmount = fullWithdrawal ? position.amount : Number(amountText)
    if (!(requestedAmount > 0) || requestedAmount > position.amount) {
      err(`Amount must be greater than 0 and no more than ${position.amount}.`, emit)
      return
    }

    log(`Preparing ${fullWithdrawal ? 'full' : 'partial'} withdrawal from position #${number}...`, emit)
    try {
      const onChainShares = await getOnChainLpShares(ctx.networkUrl, ctx.publicKey, position.poolId)
      const shareAmount = computeWithdrawShares(onChainShares, requestedAmount, position.amount)
      if (!(shareAmount > 0)) {
        throw new Error('No LP shares were found for this pool in the connected wallet.')
      }
      log('Review and approve the transaction in your wallet.', emit)
      const result = await executeApiPoolTransaction({
        publicKey: ctx.publicKey,
        signTransactionFn: signTransaction,
        params: {
          poolId: position.poolId,
          action: 'WITHDRAW',
          amountA: requestedAmount,
          amountB: 0,
          shareAmount,
          slippageBps: 50,
          userAddress: ctx.publicKey,
        },
      })
      ctx.onWithdrawn(position.id, requestedAmount)
      ok(`${fullWithdrawal ? 'Withdrawal' : 'Partial withdrawal'} confirmed.`, emit)
      transaction(result.hash, emit)
    } catch (error) {
      err(error instanceof Error ? error.message : 'Withdrawal failed.', emit)
    }
  },

  balance: (_, ctx, emit) => {
    if (ctx.status !== 'CONNECTED') {
      err('Wallet not connected. Use the Connect button in the header.', emit)
      return
    }
    log(`  XLM     ${ctx.xlmBalance.toFixed(7)}`, emit)
    ok(`  USDC    ${ctx.usdcBalance.toFixed(7)}`, emit)
  },

  whoami: (_, ctx, emit) => {
    if (!ctx.publicKey) {
      err('Wallet not connected. Use the Connect button in the header.', emit)
      return
    }
    ok(`  ${ctx.publicKey}`, emit)
    log(`  Network  ${ctx.networkPassphrase?.includes('Test') ? 'TESTNET' : 'PUBLIC'}`, emit)
  },

  network: (_, ctx, emit) => {
    if (ctx.status !== 'CONNECTED') {
      err('Wallet not connected. Use the Connect button in the header.', emit)
      return
    }
    log('  Status       CONNECTED', emit)
    log(`  Network      ${ctx.networkPassphrase?.includes('Test') ? 'TESTNET' : 'PUBLIC'}`, emit)
    log(`  Passphrase   ${ctx.networkPassphrase ?? 'Unavailable'}`, emit)
    log(`  Horizon      ${ctx.networkUrl ?? 'Unavailable'}`, emit)
  },
}

const aliases: Record<string, string> = {
  '/help': 'help',
  '/positions': 'positions',
  '/pos': 'positions',
  ls: 'positions',
  '/position': 'position',
  '/pools': 'pools',
  '/pool': 'pool',
  '/deposit': 'deposit',
  '/withdraw': 'withdraw',
  '/balance': 'balance',
  '/whoami': 'whoami',
  '/network': 'network',
}

export const availableCommands = [
  'positions',
  'position <number>',
  'pools',
  'pool <number>',
  'deposit <pool-number|pool-id> <amount-a> [amount-b]',
  'withdraw <position> [amount|--full]',
  'balance',
  'whoami',
  'network',
  'help',
  'clear',
]

export async function runCommand(raw: string, ctx: CommandContext, emit: Emit): Promise<void> {
  const trimmed = raw.trim()
  const parts = trimmed.split(/\s+/)
  const commandToken = parts[0].toLowerCase()
  const commandName = aliases[commandToken] ?? commandToken
  const handler = commands[commandName]

  if (!handler) {
    emit({ id: uid(), kind: 'error', text: `Unknown command: "${trimmed}". Type help.` })
    return
  }

  await handler(parts.slice(1), ctx, emit)
}
