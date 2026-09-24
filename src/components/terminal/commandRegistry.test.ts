import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeFiPool, LocalPosition } from '../../types/stellar'
import { executeApiPoolTransaction, getOnChainLpShares } from '../../services/terminal8Api'
import { availableCommands, runCommand, type CommandContext, type TerminalLine } from './commandRegistry'

vi.mock('@stellar/freighter-api', () => ({ signTransaction: vi.fn() }))
vi.mock('../../services/terminal8Api', () => ({
  executeApiPoolTransaction: vi.fn(),
  getOnChainLpShares: vi.fn(),
}))

const position: LocalPosition = {
  id: 'position-a',
  amount: 25,
  asset: 'XLM',
  hash: 'tx-hash',
  protocol: 'Soroswap',
  status: 'SUCCESS',
  timestamp: 'now',
  openedAt: Date.now() - 3_600_000,
  apy: 12.5,
  category: 'AMM LP',
  poolId: 'pool-a',
}

const pool: DeFiPool = {
  id: 'POOL-A',
  asset: 'XLM',
  secondaryAsset: 'USDC',
  protocol: 'Soroswap',
  category: 'AMM LP',
  apy: 12.5,
  tvl: '$10K',
  tvlRaw: 10_000,
  reputation: { liquidity: 20, age: 10, audit: 15, activity: 10 },
  risk: 'Moderate',
  method: 'addLiquidity()',
  rationale: 'Test pool',
  contractId: 'contract-a',
}

const context: CommandContext = {
  networkPassphrase: 'Test SDF Network ; September 2015',
  networkUrl: 'https://horizon-testnet.stellar.org',
  pools: [pool],
  positions: [position],
  publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  status: 'CONNECTED',
  xlmBalance: 100,
  usdcBalance: 50,
  onPositionAdded: vi.fn(),
  onWithdrawn: vi.fn(),
}

async function execute(command: string) {
  const lines: TerminalLine[] = []
  await runCommand(command, context, (line) => lines.push(line))
  return lines
}

describe('terminal command registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes only commands backed by current wallet and position state', () => {
    expect(availableCommands).toEqual([
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
    ])
  })

  it.each(['sweep all', 'show yield', 'alerts'])(
    'rejects removed command: %s',
    async (command) => {
      const lines = await execute(command)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({ kind: 'error' })
      expect('text' in lines[0] ? lines[0].text : '').toContain('Unknown command')
    },
  )

  it('prints live position details from command context', async () => {
    const lines = await execute('position 1')
    const text = lines.flatMap((line) => ('text' in line ? [line.text] : [])).join('\n')
    expect(text).toContain('pool-a')
    expect(text).toContain('25.00 XLM')
    expect(text).toContain('tx-hash')
  })

  it('executes deposits through the current transaction API', async () => {
    vi.mocked(executeApiPoolTransaction).mockResolvedValue({ hash: 'deposit-hash', status: 'SUCCESS', xdr: 'xdr' })

    const lines = await execute('deposit 1 10 5')

    expect(executeApiPoolTransaction).toHaveBeenCalledWith(expect.objectContaining({
      publicKey: context.publicKey,
      params: expect.objectContaining({ poolId: 'POOL-A', action: 'DEPOSIT', amountA: 10, amountB: 5 }),
    }))
    expect(context.onPositionAdded).toHaveBeenCalledWith(expect.objectContaining({ poolId: 'POOL-A', hash: 'deposit-hash' }))
    expect(lines.some((line) => 'text' in line && line.text.includes('Deposit confirmed'))).toBe(true)
    expect(lines).toContainEqual(expect.objectContaining({
      kind: 'transaction',
      hash: 'deposit-hash',
      href: 'https://stellar.expert/explorer/testnet/tx/deposit-hash',
    }))
  })

  it('shows the full pool ID before a user deposits by number', async () => {
    const list = await execute('pools')
    const detail = await execute('pool 1')
    const listText = list.flatMap((line) => ('text' in line ? [line.text] : [])).join('\n')
    const detailText = detail.flatMap((line) => ('text' in line ? [line.text] : [])).join('\n')

    expect(listText).toContain('Use: pool <number>')
    expect(detailText).toContain('POOL-A')
  })

  it('uses on-chain LP shares for terminal withdrawals', async () => {
    vi.mocked(getOnChainLpShares).mockResolvedValue('40')
    vi.mocked(executeApiPoolTransaction).mockResolvedValue({ hash: 'withdraw-hash', status: 'SUCCESS', xdr: 'xdr' })

    const lines = await execute('withdraw 1 12.5')

    expect(executeApiPoolTransaction).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({ poolId: 'pool-a', action: 'WITHDRAW', amountA: 12.5, shareAmount: 20 }),
    }))
    expect(context.onWithdrawn).toHaveBeenCalledWith('position-a', 12.5)
    expect(lines).toContainEqual(expect.objectContaining({
      kind: 'transaction',
      hash: 'withdraw-hash',
      href: 'https://stellar.expert/explorer/testnet/tx/withdraw-hash',
    }))
  })
})
