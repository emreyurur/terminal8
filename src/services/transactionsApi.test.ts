import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTransactionFromApi } from './terminal8Api'
import { previewSingleAssetDeposit, type SingleAssetBuild } from './singleAssetDeposit'

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response
}

describe('transaction API contracts', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    localStorage.setItem('terminal8_jwt_token', 'jwt-token')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('builds a both-assets deposit using only the documented DTO fields', async () => {
    fetchMock.mockResolvedValueOnce(response({ xdr: 'unsigned-xdr', networkPassphrase: 'testnet' }, 201))

    await buildTransactionFromApi({
      poolId: 'pool-id',
      action: 'DEPOSIT',
      amountA: 12.5,
      amountB: 8.75,
      shareAmount: 999,
      slippageBps: 50,
      userAddress: 'GUSER',
      publicKey: 'GUSER',
    }, 'jwt-token')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/transactions\/build$/)
    expect(init).toMatchObject({ method: 'POST' })
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt-token' })
    expect(JSON.parse(init.body)).toEqual({
      poolId: 'pool-id',
      action: 'DEPOSIT',
      amountA: 12.5,
      amountB: 8.75,
      shareAmount: 0,
      slippageBps: 50,
    })
  })

  it('builds a withdrawal with the required zero amount fields', async () => {
    fetchMock.mockResolvedValueOnce(response({ xdr: 'unsigned-xdr', networkPassphrase: 'testnet' }, 201))

    await buildTransactionFromApi({
      poolId: 'pool-id',
      action: 'WITHDRAW',
      amountA: 55,
      amountB: 34,
      shareAmount: 4.25,
      slippageBps: 100,
    }, 'jwt-token')

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      poolId: 'pool-id',
      action: 'WITHDRAW',
      amountA: 0,
      amountB: 0,
      shareAmount: 4.25,
      slippageBps: 100,
    })
  })

  it('requests the atomic single-asset swap and deposit plan', async () => {
    const built: SingleAssetBuild = {
      xdr: 'atomic-xdr',
      networkPassphrase: 'Test SDF Network ; September 2015',
      plan: {
        sourceAsset: 'XLM',
        destAsset: 'USDC',
        swapAmount: 5,
        receiveAmount: 1,
        sendMax: 5.1,
        expectedDepositSource: 5,
        expectedDepositDest: 1,
        priceImpactPct: 0.4,
        estimatedLeftoverSource: 0,
        slippageBps: 50,
        addsTrustlines: [],
      },
    }
    fetchMock.mockResolvedValueOnce(response(built, 201))
    const sign = vi.fn()

    await expect(previewSingleAssetDeposit('GUSER', sign, {
      poolId: 'a'.repeat(64),
      sourceAsset: 'XLM',
      amount: 10,
      slippageBps: 50,
    })).resolves.toEqual(built)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/transactions\/single-asset-deposit$/)
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt-token' })
    expect(JSON.parse(init.body)).toEqual({
      poolId: 'a'.repeat(64),
      sourceAsset: 'XLM',
      amount: 10,
      slippageBps: 50,
    })
    expect(sign).not.toHaveBeenCalled()
  })

  it('rejects invalid single-asset amounts before calling the backend', async () => {
    await expect(previewSingleAssetDeposit('GUSER', vi.fn(), {
      poolId: 'a'.repeat(64),
      sourceAsset: 'XLM',
      amount: 0,
      slippageBps: 50,
    })).rejects.toThrow('Amount must be greater than zero.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
