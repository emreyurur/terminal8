import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeFiPool, LocalPosition } from '../../types/stellar'
import { executeOnChainTrustVote, fetchOnChainPoolScore } from '../../services/poolVotingContract'
import { PoolDetailsView } from './PoolDetailsView'

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({
    connect: vi.fn(),
    networkPassphrase: 'Test SDF Network ; September 2015',
    networkUrl: 'https://horizon-testnet.stellar.org',
    publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    status: 'CONNECTED',
  }),
}))

vi.mock('../../hooks/usePoolRisk', () => ({ usePoolRisk: () => ({ status: 'idle' }) }))
vi.mock('../../hooks/usePoolDashboard', () => ({ usePoolDashboard: () => ({ status: 'idle' }) }))
vi.mock('../../services/terminal8Api', () => ({
  executeApiPoolTransaction: vi.fn(),
  fetchTransactionHistory: vi.fn().mockResolvedValue([]),
  getOnChainLpShares: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../services/poolVotingContract', () => ({
  executeOnChainTrustVote: vi.fn(),
  fetchOnChainPoolScore: vi.fn(),
}))

const pool: DeFiPool = {
  id: 'pool-a',
  asset: 'XLM',
  secondaryAsset: 'USDC',
  protocol: 'Soroswap',
  apy: 12.5,
  tvl: '$1.2M',
  tvlRaw: 1_200_000,
  risk: 'Conservative',
  category: 'AMM LP',
  feeBp: 30,
  reputation: { liquidity: 20, age: 10, audit: 10, activity: 10 },
  method: 'addLiquidity()',
  rationale: 'Pool used by the voting tests',
  contractId: 'contract-a',
}

const activePosition: LocalPosition = {
  id: 'position-a',
  amount: 10,
  asset: 'XLM',
  hash: 'hash-a',
  protocol: 'Soroswap',
  status: 'SUCCESS',
  timestamp: 'now',
  openedAt: Date.now(),
  apy: 12.5,
  category: 'AMM LP',
  poolId: pool.id,
}

function renderView(userPositions: LocalPosition[] = []) {
  return render(
    <PoolDetailsView
      available={100}
      initialTab="overview"
      onBack={() => {}}
      onPositionAdded={() => {}}
      pool={pool}
      userPositions={userPositions}
    />,
  )
}

describe('PoolDetailsView on-chain vault voting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows zero contract votes without mock totals and locks voting without a position', async () => {
    vi.mocked(fetchOnChainPoolScore).mockResolvedValue({ upvotes: 0, downvotes: 0 })

    renderView()

    const trusted = await screen.findByRole('button', { name: 'Vote trusted. Current on-chain votes: 0' })
    const risky = screen.getByRole('button', { name: 'Vote risky. Current on-chain votes: 0' })
    expect(trusted).toBeDisabled()
    expect(risky).toBeDisabled()
    expect(screen.getByText('Voting locked until this wallet has an active position.')).toBeInTheDocument()
    expect(screen.queryByText('24')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  it('allows an active position to vote and reloads the confirmed totals from the contract', async () => {
    vi.mocked(fetchOnChainPoolScore)
      .mockResolvedValueOnce({ upvotes: 7, downvotes: 2 })
      .mockResolvedValueOnce({ upvotes: 8, downvotes: 2 })
    vi.mocked(executeOnChainTrustVote).mockResolvedValue({ hash: 'tx-hash', status: 'SUCCESS', isSoroban: true })

    renderView([activePosition])

    const trusted = await screen.findByRole('button', { name: 'Vote trusted. Current on-chain votes: 7' })
    expect(trusted).toBeEnabled()
    fireEvent.click(trusted)

    await waitFor(() => expect(executeOnChainTrustVote).toHaveBeenCalledWith(expect.objectContaining({ poolId: pool.id, isUpvote: true })))
    expect(await screen.findByRole('button', { name: 'Vote trusted. Current on-chain votes: 8' })).toBeInTheDocument()
    expect(fetchOnChainPoolScore).toHaveBeenCalledTimes(2)
  })

  it('does not invent totals when the contract score is unavailable', async () => {
    vi.mocked(fetchOnChainPoolScore).mockResolvedValue(null)

    renderView([activePosition])

    const trusted = await screen.findByRole('button', { name: 'Vote trusted. Current on-chain votes: --' })
    expect(trusted).toBeDisabled()
    expect(screen.getByText('On-chain vote totals are currently unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
