import { PoolContractV2, RequestType } from '@blend-capital/blend-sdk'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { BASE_FEE, Horizon, TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk'

const BLEND_TESTNET = {
  poolId: 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF',
  assets: {
    XLM: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    USDC: 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU',
  },
}

type BlendSupplyParams = {
  amount: number
  asset: 'XLM' | 'USDC' | 'EURC'
  horizonUrl: string
  networkPassphrase: string
  publicKey: string
  sorobanRpcUrl: string
}

function toStroopsLikeAmount(amount: number) {
  return BigInt(Math.floor(amount * 10_000_000))
}

export async function executeBlendTestnetSupply({
  amount,
  asset,
  horizonUrl,
  networkPassphrase,
  publicKey,
  sorobanRpcUrl,
}: BlendSupplyParams) {
  if (amount <= 0) {
    throw new Error('Enter an amount greater than 0 before signing.')
  }

  if (!networkPassphrase.toLowerCase().includes('test')) {
    throw new Error('Blend supply is enabled for Testnet only. Switch Freighter to Testnet.')
  }

  const horizon = new Horizon.Server(horizonUrl)
  const sourceAccount = await horizon.loadAccount(publicKey)
  const pool = new PoolContractV2(BLEND_TESTNET.poolId)
  const normalizedAsset = asset === 'EURC' ? 'USDC' : asset

  const supplyOperation = xdr.Operation.fromXDR(
    pool.submit({
      from: publicKey,
      spender: publicKey,
      to: publicKey,
      requests: [
        {
          amount: toStroopsLikeAmount(amount),
          request_type: RequestType.SupplyCollateral,
          address: BLEND_TESTNET.assets[normalizedAsset],
        },
      ],
    }),
    'base64',
  )

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(supplyOperation)
    .setTimeout(60)
    .build()

  const rpcServer = new rpc.Server(sorobanRpcUrl)
  const preparedTransaction = await rpcServer.prepareTransaction(transaction)
  const signed = await StellarWalletsKit.signTransaction(preparedTransaction.toXDR(), {
    address: publicKey,
    networkPassphrase,
  })

  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, networkPassphrase)
  const response = await rpcServer.sendTransaction(signedTransaction)

  return {
    hash: response.hash,
    status: response.status,
  }
}
