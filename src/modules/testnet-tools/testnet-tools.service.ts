import { Injectable, Logger } from '@nestjs/common';
import { Asset, Keypair, Operation, TransactionBuilder, Networks, LiquidityPoolAsset, Horizon, getLiquidityPoolId } from '@stellar/stellar-sdk';
import { BuildLpTxDto } from './dto/build-lp-tx.dto';
import { BuildTrustMintTxDto } from './dto/build-trust-mint-tx.dto';
import { HistoryService } from '../history/history.service';
import { TransactionType } from '../history/entities/transaction-history.entity';

@Injectable()
export class TestnetToolsService {
  private readonly logger = new Logger(TestnetToolsService.name);

  constructor(private readonly historyService: HistoryService) {}

  async buildLiquidityPoolTransaction(params: BuildLpTxDto) {
    this.logger.log(`Building LP transaction for user ${params.userPublicKey}...`);

    const issuerSecretStr = process.env.TESTNET_ISSUER_SECRET;
    if (!issuerSecretStr) {
      throw new Error('TESTNET_ISSUER_SECRET is required in .env');
    }

    const issuerKeys = Keypair.fromSecret(issuerSecretStr);
    const server = new Horizon.Server('https://horizon-testnet.stellar.org');

    try {
      this.logger.log('Loading user account from Horizon to get sequence number...');
      const userAccount = await server.loadAccount(params.userPublicKey);

      let asset1: Asset;
      let asset2: Asset;

      if (params.tokenA.toUpperCase() === 'XLM') {
        asset1 = Asset.native();
      } else {
        asset1 = new Asset(params.tokenA, issuerKeys.publicKey());
      }

      if (params.tokenB.toUpperCase() === 'XLM') {
        asset2 = Asset.native();
      } else {
        asset2 = new Asset(params.tokenB, issuerKeys.publicKey());
      }

      // Stellar requires Asset A < Asset B (Lexicographic order)
      let assetA = asset1;
      let assetB = asset2;
      let maxAmountA = params.amountA;
      let maxAmountB = params.amountB;
      let finalMintAmountA = params.mintAmountA;
      let finalMintAmountB = params.mintAmountB;

      if (Asset.compare(asset1, asset2) === 1) {
        assetA = asset2;
        assetB = asset1;
        maxAmountA = params.amountB;
        maxAmountB = params.amountA;
        finalMintAmountA = params.mintAmountB;
        finalMintAmountB = params.mintAmountA;
      }

      const txBuilder = new TransactionBuilder(userAccount, {
        fee: '10000',
        networkPassphrase: Networks.TESTNET,
      });

      // 1. Trustlines for custom tokens
      if (!assetA.isNative()) {
        txBuilder.addOperation(Operation.changeTrust({ asset: assetA, limit: '1000000' }));
      }
      if (!assetB.isNative()) {
        txBuilder.addOperation(Operation.changeTrust({ asset: assetB, limit: '1000000' }));
      }

      // 2. Mint custom tokens to user
      if (!assetA.isNative() && finalMintAmountA) {
        txBuilder.addOperation(
          Operation.payment({
            source: issuerKeys.publicKey(),
            destination: params.userPublicKey,
            asset: assetA,
            amount: finalMintAmountA,
          })
        );
      }
      if (!assetB.isNative() && finalMintAmountB) {
        txBuilder.addOperation(
          Operation.payment({
            source: issuerKeys.publicKey(),
            destination: params.userPublicKey,
            asset: assetB,
            amount: finalMintAmountB,
          })
        );
      }

      // 3. LP Trustline
      txBuilder.addOperation(Operation.changeTrust({ asset: new LiquidityPoolAsset(assetA, assetB, 30) }));

      // 4. LP Deposit
      txBuilder.addOperation(
        Operation.liquidityPoolDeposit({
          liquidityPoolId: getLiquidityPoolId('constant_product', { assetA, assetB, fee: 30 }).toString('hex'),
          maxAmountA: maxAmountA,
          maxAmountB: maxAmountB,
          minPrice: '0.001',
          maxPrice: '1000.0',
        })
      );

      const tx = txBuilder.setTimeout(180).build();

      // Sign partially with issuer key (since we have mint/payment operations from the issuer)
      // The user will still need to sign this on the frontend because they are the transaction source.
      this.logger.log('Signing transaction with issuer key...');
      tx.sign(issuerKeys);

      const xdr = tx.toXDR();
      const poolId = getLiquidityPoolId('constant_product', { assetA, assetB, fee: 30 }).toString('hex');

      return {
        success: true,
        xdr: xdr,
        poolId: poolId,
        assetACode: assetA.code,
        assetBCode: assetB.code,
        issuerPublicKey: issuerKeys.publicKey(),
        userPublicKey: params.userPublicKey
      };
      
    } catch (error) {
      let errorMsg = error.message;
      if (error.response?.data) {
        if (error.response.data.extras?.result_codes) {
          errorMsg = JSON.stringify(error.response.data.extras.result_codes);
        } else {
          errorMsg = JSON.stringify(error.response.data);
        }
      }
      this.logger.error(`Error in buildLiquidityPoolTransaction: ${errorMsg}`);
      throw new Error(`Failed to build transaction: ${errorMsg}`);
    }
  }

  async buildTrustAndMintTransaction(params: BuildTrustMintTxDto) {
    this.logger.log(`Building Trust+Mint transaction for token ${params.tokenCode}...`);

    const issuerSecretStr = process.env.TESTNET_ISSUER_SECRET;
    if (!issuerSecretStr) throw new Error('TESTNET_ISSUER_SECRET is required in .env');
    const issuerSecretKeys = Keypair.fromSecret(issuerSecretStr);
    const issuerPub = issuerSecretKeys.publicKey();

    const server = new Horizon.Server('https://horizon-testnet.stellar.org');
    
    try {
      this.logger.log(`Loading user account (${params.userPublicKey}) from Horizon...`);
      const userAccount = await server.loadAccount(params.userPublicKey);
      const token = new Asset(params.tokenCode, issuerPub);

      const txBuilder = new TransactionBuilder(userAccount, {
        fee: '10000',
        networkPassphrase: Networks.TESTNET,
      });

      // 1. Trustline operation
      txBuilder.addOperation(
        Operation.changeTrust({
          asset: token,
          limit: '1000000',
        })
      );

      // 2. Mint operation (Payment)
      txBuilder.addOperation(
        Operation.payment({
          source: issuerPub,
          destination: params.userPublicKey,
          asset: token,
          amount: params.amount,
        })
      );

      const tx = txBuilder.setTimeout(180).build();

      this.logger.log('Signing transaction with backend issuer key...');
      tx.sign(issuerSecretKeys);

      return {
        success: true,
        xdr: tx.toXDR(),
        tokenCode: params.tokenCode,
        amount: params.amount,
        destination: params.userPublicKey,
        issuerPublicKey: issuerPub,
        requiresFrontendSignature: true // Always requires user signature (they are the tx source)
      };
    } catch (error) {
      let errorMsg = error.message;
      if (error.response?.data?.extras?.result_codes) {
        errorMsg = JSON.stringify(error.response.data.extras.result_codes);
      } else if (error.response?.data) {
        errorMsg = JSON.stringify(error.response.data);
      }
      this.logger.error(`Error in buildTrustAndMintTransaction: ${errorMsg}`);
      throw new Error(`Failed to build transaction: ${errorMsg}`);
    }
  }
  async submitAndLogMint(params: { signedXdr: string, tokenCode: string, amount: string, destination: string }) {
    const server = new Horizon.Server('https://horizon-testnet.stellar.org');
    try {
      const tx = TransactionBuilder.fromXDR(params.signedXdr, Networks.TESTNET);
      const response = await server.submitTransaction(tx as any);
      
      if (this.historyService) {
        await this.historyService.logTransaction({
          operationId: `mint_${response.hash}`,
          occurredAt: new Date(),
          userPublicKey: params.destination,
          type: TransactionType.MINT,
          assetA: params.tokenCode,
          amountA: params.amount,
          tx: response.hash
        });
      }

      return { success: true, hash: response.hash };
    } catch (error) {
      let errorMsg = error.message;
      if (error.response?.data?.extras?.result_codes) {
        errorMsg = JSON.stringify(error.response.data.extras.result_codes);
      }
      this.logger.error(`Failed to submit tx: ${errorMsg}`);
      throw new Error(`Failed to submit transaction to Horizon: ${errorMsg}`);
    }
  }
}
