import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import {
  TransactionBuilder,
  Operation,
  Asset,
  Account,
} from "@stellar/stellar-sdk";
import { appConfig } from "../../../config/app.config";
import { LiquidityPool } from "../../scout/entities/liquidity-pool.entity";
import { HorizonClient } from "../../scout/horizon/horizon.client";
import { LiquidityPoolAsset } from "@stellar/stellar-sdk";

@Injectable()
export class XdrBuilderService {
  constructor(
    @Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>,
    private readonly horizonClient: HorizonClient,
  ) {}

  private getStellarAsset(code: string, issuer: string | null): Asset {
    if (code === "XLM" && !issuer) {
      return Asset.native();
    }
    return new Asset(code, issuer!);
  }

  async buildDepositXdr(
    publicKey: string,
    pool: LiquidityPool,
    maxAmountA: number,
    maxAmountB: number,
    minPrice: number,
    maxPrice: number,
  ): Promise<string> {
    // const assetA = this.getStellarAsset(pool.assetACode, pool.assetAIssuer);
    // const assetB = this.getStellarAsset(pool.assetBCode, pool.assetBIssuer);

    const accountRes = await this.horizonClient.fetchAccount(publicKey);
    if (!accountRes) {
      throw new BadRequestException(
        "Source account does not exist on the network",
      );
    }

    const tx = new TransactionBuilder(
      new Account(publicKey, accountRes.sequence),
      {
        fee: "100",
        networkPassphrase: this.config.networkPassphrase,
      },
    );

    // Check if user has trustline for this LP pool
    const hasLpTrustline = accountRes.balances.some(
      (b: any) => b.liquidity_pool_id === pool.id,
    );

    if (!hasLpTrustline) {
      const assetA = this.getStellarAsset(pool.assetACode, pool.assetAIssuer);
      const assetB = this.getStellarAsset(pool.assetBCode, pool.assetBIssuer);

      tx.addOperation(
        Operation.changeTrust({
          asset: new LiquidityPoolAsset(assetA, assetB, pool.feeBp),
          limit: "922337203685.4775807",
        }),
      );
    }

    const transaction = tx
      .addOperation(
        Operation.liquidityPoolDeposit({
          liquidityPoolId: pool.id,
          maxAmountA: maxAmountA.toFixed(7),
          maxAmountB: maxAmountB.toFixed(7),
          minPrice: minPrice.toFixed(7), // P = A/B
          maxPrice: maxPrice.toFixed(7),
        }),
      )
      .setTimeout(300)
      .build();

    return transaction.toXDR();
  }

  async buildWithdrawXdr(
    publicKey: string,
    pool: LiquidityPool,
    shareAmount: number,
    minAmountA: number,
    minAmountB: number,
  ): Promise<string> {
    const accountRes = await this.horizonClient.fetchAccount(publicKey);
    if (!accountRes) {
      throw new BadRequestException(
        "Source account does not exist on the network",
      );
    }

    const tx = new TransactionBuilder(
      new Account(publicKey, accountRes.sequence),
      {
        fee: "100",
        networkPassphrase: this.config.networkPassphrase,
      },
    )
      .addOperation(
        Operation.liquidityPoolWithdraw({
          liquidityPoolId: pool.id,
          amount: shareAmount.toFixed(7),
          minAmountA: minAmountA.toFixed(7),
          minAmountB: minAmountB.toFixed(7),
        }),
      )
      .setTimeout(300)
      .build();

    return tx.toXDR();
  }
}
