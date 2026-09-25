import { Injectable, Inject, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../config/app.config";
import { RedisService } from "../../core/redis/redis.service";
import { OracleAsset, PriceData } from "./oracle.types";
import {
  ORACLE_CACHE_PREFIX,
  SEP40_DEFAULT_DECIMALS,
} from "./oracle.constants";
import { resolveSacAddress, toReflectorParam } from "./sac-resolver";
import { Contract, rpc, scValToNative, Account, TransactionBuilder } from "@stellar/stellar-sdk";

@Injectable()
export class OracleService implements OnModuleInit {
  private readonly logger = new Logger(OracleService.name);
  private readonly RPC_CONCURRENCY_LIMIT = 3;

  private decimals: number = SEP40_DEFAULT_DECIMALS;
  private divisor: number = Math.pow(10, SEP40_DEFAULT_DECIMALS);
  private decimalsConfirmed = false;

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.tryInitDecimals();

    void this.warmCache().catch((err) =>
      this.logger.warn(
        `Initial cache warming failed, will retry via cron: ${err.message}`,
      ),
    );

    this.startCacheWarmingCron();
    this.logger.log(
      "OracleService initialized (decimals and cache warming are best-effort)",
    );
  }

  private async tryInitDecimals(): Promise<void> {
    try {
      const contract = new Contract(this.config.reflectorContractId);
      const server = new rpc.Server(this.config.sorobanRpcUrl);

      // Build a read-only transaction using server.prepareTransaction
      // Wait, there is no buildReadOnlyTx in stellar-sdk out of the box. 
      // For simulateTransaction with a Contract.call, we can just build an un-signed transaction.
      // But actually, for simulateTransaction, you just need a transaction object.
      // We can use the simple approach of using server.simulateTransaction with a minimal tx.
      // Wait, is there a simple way to call read-only Soroban contracts?
      // With newer stellar-sdk: server.simulateTransaction requires a Transaction.
      // Let's implement a dummy transaction.
      const sourceAccount = new Account(
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0"
      ); // Dummy account

      const tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: this.config.networkPassphrase,
      })
        .addOperation(contract.call("decimals"))
        .setTimeout(30)
        .build();

      const result = await server.simulateTransaction(tx);

      if (rpc.Api.isSimulationSuccess(result) && result.result) {
        this.decimals = scValToNative(result.result.retval);
        this.divisor = Math.pow(10, this.decimals);
        this.decimalsConfirmed = true;
        this.logger.log(`Oracle decimals confirmed from chain: ${this.decimals}`);
      } else {
        throw new Error("Simulation failed or returned no result");
      }
    } catch (err) {
      this.logger.warn(
        `Failed to fetch decimals from Oracle RPC: ${err.message}. ` +
          `Using SEP-40 default: ${SEP40_DEFAULT_DECIMALS}. App continues normally.`,
      );
    }
  }

  private parsePrice(rawPrice: bigint): number {
    return Number(rawPrice) / this.divisor;
  }

  private startCacheWarmingCron(): void {
    const intervalMs = this.config.oracleCacheTtl * 1000;
    const timer = setInterval(() => void this.warmCache(), intervalMs);
    timer.unref();
    this.logger.log(
      `Oracle cache warming cron started (every ${this.config.oracleCacheTtl}s)`,
    );
  }

  private async warmCache(): Promise<void> {
    const supportedAssets = await this.getSupportedAssets();

    const chunks = this.chunkArray(supportedAssets, this.RPC_CONCURRENCY_LIMIT);

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map((asset) => this.fetchAndCacheSinglePrice(asset)),
      );

      for (const result of results) {
        if (result.status === "rejected") {
          this.logger.warn(`Cache warming failed for asset: ${result.reason}`);
        }
      }
    }
  }

  private async fetchAndCacheSinglePrice(asset: OracleAsset): Promise<void> {
    const sacAddress = resolveSacAddress(
      asset.code,
      asset.issuer,
      this.config.networkPassphrase,
    );
    const priceData = await this.fetchPriceFromChain(sacAddress);

    if (priceData) {
      const cacheKey = `${ORACLE_CACHE_PREFIX}:${asset.code}:${asset.issuer ?? "native"}`;
      await this.redis.set(
        cacheKey,
        priceData,
        this.config.oracleStaleTtl,
      );
    }
  }

  private async fetchPriceFromChain(
    sacAddress: string,
  ): Promise<PriceData | null> {
    try {
      const contract = new Contract(this.config.reflectorContractId);
      const server = new rpc.Server(this.config.sorobanRpcUrl);
      const param = toReflectorParam(sacAddress);

      // Dummy account
      const sourceAccount = new Account(
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0"
      );
      
      const tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: this.config.networkPassphrase,
      })
        .addOperation(contract.call("lastprice", param))
        .setTimeout(30)
        .build();

      const result = await server.simulateTransaction(tx);

      if (!rpc.Api.isSimulationSuccess(result) || !result.result) {
        return null; // Contract reverted or error
      }

      const parsed = scValToNative(result.result.retval);
      if (!parsed || !parsed.price || !parsed.timestamp) {
        return null;
      }
      
      const price = parsed.price;
      const timestamp = parsed.timestamp;

      const nowSeconds = Math.floor(Date.now() / 1000);
      const ageSeconds = nowSeconds - Number(timestamp);

      if (ageSeconds > this.config.oracleStalenessLimit) {
        this.logger.warn(
          `Oracle price for ${sacAddress} is stale: ${ageSeconds}s old (limit: ${this.config.oracleStalenessLimit}s). Skipping.`,
        );
        return null;
      }

      return {
        price: this.parsePrice(price),
        timestamp: Number(timestamp),
        ageSeconds,
      };
    } catch (e) {
      this.logger.warn(`Failed to fetch price for ${sacAddress}: ${e.message}`);
      return null;
    }
  }

  // --- Public Methods (Client Okuma) ---

  private dynamicallyRequestedAssets = new Map<string, OracleAsset>();

  /**
   * Retrieves the USD price of an asset from the Redis cache.
   * Never blocks on an RPC call.
   */
  async getUsdPrice(
    assetCode: string,
    issuer?: string | null,
  ): Promise<number | null> {
    const cacheKey = `${ORACLE_CACHE_PREFIX}:${assetCode}:${issuer ?? "native"}`;
    
    if (!this.dynamicallyRequestedAssets.has(cacheKey)) {
      this.dynamicallyRequestedAssets.set(cacheKey, { code: assetCode, issuer });
    }

    const priceData = await this.redis.get<PriceData>(cacheKey);

    if (!priceData) {
      this.logger.verbose(
        `No cached price for ${assetCode}. Returning null.`,
      );
      return null;
    }

    return priceData.price;
  }

  /**
   * Batch retrieves USD prices from the Redis cache.
   */
  async getBatchUsdPrices(
    assets: OracleAsset[],
  ): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    const keys = [];

    for (const a of assets) {
      const key = `${ORACLE_CACHE_PREFIX}:${a.code}:${a.issuer ?? "native"}`;
      keys.push(key);
      
      if (!this.dynamicallyRequestedAssets.has(key)) {
        this.dynamicallyRequestedAssets.set(key, a);
      }
    }

    const results = await Promise.all(
      keys.map((key) => this.redis.get<PriceData>(key))
    );

    for (let i = 0; i < results.length; i++) {
      const priceData = results[i];
      if (priceData) {
        prices.set(assets[i].code, priceData.price);
      }
    }

    return prices;
  }

  /**
   * Returns XLM, USDC, and any other assets that have been requested dynamically.
   */
  async getSupportedAssets(): Promise<OracleAsset[]> {
    const baseAssets: OracleAsset[] = [
      { code: "XLM", issuer: null },
      { code: this.config.network.usdc.code, issuer: this.config.network.usdc.issuer },
    ];
    
    const allAssetsMap = new Map<string, OracleAsset>();
    
    for (const a of baseAssets) {
      allAssetsMap.set(`${a.code}:${a.issuer ?? "native"}`, a);
    }
    
    for (const [key, a] of this.dynamicallyRequestedAssets.entries()) {
      allAssetsMap.set(key, a);
    }

    return Array.from(allAssetsMap.values());
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
