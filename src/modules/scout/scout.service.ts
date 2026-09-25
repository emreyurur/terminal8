import { Injectable, Logger, Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../config/app.config";
import { Repository } from "typeorm";
import { LiquidityPool } from "./entities/liquidity-pool.entity";
import { PoolSnapshot } from "./entities/pool-snapshot.entity";
import { HorizonClient } from "./horizon/horizon.client";
import { HorizonPoolResponse } from "./horizon/horizon.types";
import { RedisService } from "../../core/redis/redis.service";
import { OracleService } from "../oracle/oracle.service";
import { CACHE_KEYS } from "../../shared/constants";

@Injectable()
export class ScoutService {
  private readonly logger = new Logger(ScoutService.name);

  constructor(
    @InjectRepository(LiquidityPool)
    private readonly poolRepository: Repository<LiquidityPool>,
    @InjectRepository(PoolSnapshot)
    private readonly snapshotRepository: Repository<PoolSnapshot>,
    private readonly horizonClient: HorizonClient,
    private readonly redisService: RedisService,
    private readonly oracleService: OracleService,
    @Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>,
  ) { }

  async syncLiquidityPools() {
    this.logger.log("Starting liquidity pools sync...");
    const allPools = await this.horizonClient.fetchAllPools();
    
    // Filter out fake USDC pools (Testnet protection)
    const officialUsdcIssuer = this.config.network.usdc.issuer;
    const pools = allPools.filter(p => {
      for (const r of p.reserves) {
        if (r.asset !== "native" && r.asset.startsWith("USDC:")) {
          const [, issuer] = r.asset.split(":");
          if (issuer !== officialUsdcIssuer) return false;
        }
      }
      return true;
    });

    this.logger.log(`Fetched ${allPools.length} pools from Horizon, ${pools.length} valid pools after filtering`);

    // Calculate approximate TVL to find the truly valuable pools
    const getApproxTvl = (p: any) => {
      let tvl = 0;
      let hasNative = false;
      let hasUsdc = false;

      for (const r of p.reserves) {
        if (r.asset === "native") {
          tvl += parseFloat(r.amount) * 0.1;
          hasNative = true;
        } else if (r.asset.includes("USDC")) {
          tvl += parseFloat(r.amount) * 1;
          hasUsdc = true;
        } else if (r.asset.includes("AQUA")) {
          tvl += parseFloat(r.amount) * 0.0005;
        } else if (r.asset.includes("yXLM")) {
          tvl += parseFloat(r.amount) * 0.1;
        }
      }

      // User requested XLM/USDC to be always #1
      if (hasNative && hasUsdc) {
        tvl += 1000000000; 
      }
      return tvl;
    };

    // Sort pools by approximate USD value (descending)
    pools.sort((a, b) => getApproxTvl(b) - getApproxTvl(a));

    // Select the top 30 most valuable pools
    const selectedPools = pools.slice(0, 30);
    const activePoolIds = new Set<string>();

    for (const poolData of selectedPools) {
      activePoolIds.add(poolData.id);
      await this.upsertPool(poolData);
    }

    // Olmayan poolları isActive = false yap
    if (activePoolIds.size > 0) {
      await this.poolRepository
        .createQueryBuilder()
        .update(LiquidityPool)
        .set({ isActive: false })
        .where("id NOT IN (:...ids)", { ids: Array.from(activePoolIds) })
        .execute();
    }
    
    this.logger.log(`Liquidity pools sync completed. Tracking ${activePoolIds.size} selected pools.`);
  }

  private async upsertPool(data: HorizonPoolResponse) {
    const parseAsset = (assetString: string) => {
      if (assetString === "native") {
        return { code: "XLM", issuer: null };
      }
      const [code, issuer] = assetString.split(":");
      return { code, issuer };
    };

    const assetA = parseAsset(data.reserves[0].asset);
    const assetB = parseAsset(data.reserves[1].asset);

    let pool = await this.poolRepository.findOne({ where: { id: data.id } });
    if (!pool) {
      pool = this.poolRepository.create({ id: data.id });
    }

    pool.feeBp = data.fee_bp;
    pool.type = data.type;
    pool.totalShares = data.total_shares;
    pool.assetACode = assetA.code;
    pool.assetAIssuer = assetA.issuer;
    pool.reserveA = data.reserves[0].amount;
    pool.assetBCode = assetB.code;
    pool.assetBIssuer = assetB.issuer;
    pool.reserveB = data.reserves[1].amount;
    pool.totalTrustlines = data.total_trustlines;
    pool.lastSyncedAt = new Date();
    pool.isActive = true;

    await this.poolRepository.save(pool);
    await this.redisService.set(
      `${CACHE_KEYS.POOL_PREFIX}${pool.id}`,
      pool,
      300,
    ); // 5dk cache
  }

  async forceFetchPool(poolId: string): Promise<LiquidityPool | null> {
    const horizonData = await this.horizonClient.fetchPool(poolId);
    if (!horizonData) return null;
    await this.upsertPool(horizonData);
    return this.getPool(poolId);
  }

  async takeDailySnapshots() {
    this.logger.log("Starting daily snapshots...");
    const activePools = await this.poolRepository.find({
      where: { isActive: true },
    });

    for (const pool of activePools) {
      try {
        let volumeA = 0;
        let volumeB = 0;

        try {
          const axios = require("axios");
          const isTestnet = this.config.networkPassphrase.includes("Test");
      const networkType = isTestnet ? "testnet" : "public";
      const res = await axios.get(`https://api.stellar.expert/explorer/${networkType}/liquidity-pool/${pool.id}`);
          
          if (res.data && res.data.volume && res.data.volume.length === 2) {
            volumeA = (res.data.volume[0]["1d"] || 0) / 10000000;
            volumeB = (res.data.volume[1]["1d"] || 0) / 10000000;
          }
        } catch (apiErr) {
          this.logger.warn(`Failed to fetch 24h volume from Stellar Expert for pool ${pool.id}: ${apiErr.message}`);
          // volumeA ve volumeB 0 kalır.
        }

        // OracleService kullanarak gerçek USD fiyatlarını çekiyoruz
        const priceAUsd = (await this.oracleService.getUsdPrice(
          pool.assetACode,
          pool.assetAIssuer,
        )) || 0;
        const priceBUsd = (await this.oracleService.getUsdPrice(
          pool.assetBCode,
          pool.assetBIssuer,
        )) || 0;

        const tvlUsd =
          parseFloat(pool.reserveA) * priceAUsd +
          parseFloat(pool.reserveB) * priceBUsd;
        const volume24hUsd = volumeA * priceAUsd + volumeB * priceBUsd; // Hacim de gerçek fiyattan hesaplanır

        // Sadece Düşük Hacimli pool filtrelemesine takılmayanlar (Örn: TVL/Hacim çok düşükse skip)
        // Burada basitçe snapshot alıyoruz.
        const snapshot = this.snapshotRepository.create({
          pool,
          poolId: pool.id,
          reserveA: pool.reserveA,
          reserveB: pool.reserveB,
          totalShares: pool.totalShares,
          priceAUsd: priceAUsd.toString(),
          priceBUsd: priceBUsd.toString(),
          tvlUsd: tvlUsd.toString(),
          volume24hUsd: volume24hUsd.toString(),
          snapshotAt: new Date(),
        });
        await this.snapshotRepository.save(snapshot);

        // Rate limit'i aşmamak için her havuz arasında 1 saniye bekle
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (e) {
        this.logger.error(
          `Error taking snapshot for pool ${pool.id}: ${e.message}`,
        );
      }
    }
    this.logger.log("Daily snapshots completed.");
  }

  async getPools(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.poolRepository
      .createQueryBuilder("pool")
      .where("pool.isActive = :isActive", { isActive: true })
      .addSelect(
        `CASE WHEN ("pool"."assetACode" = 'USDC' AND "pool"."assetBCode" = 'XLM') OR ("pool"."assetACode" = 'XLM' AND "pool"."assetBCode" = 'USDC') THEN 1 ELSE 0 END`,
        'isUsdcXlm'
      )
      .orderBy('"isUsdcXlm"', 'DESC')
      .addOrderBy('pool.totalTrustlines', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getRecommendedPools(pubkey: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    // 1. Fetch user's account from Horizon to get their balances
    const account = await this.horizonClient.fetchAccount(pubkey);

    // If account doesn't exist on network, return default sort
    if (!account || !account.balances || account.balances.length === 0) {
      return this.getPools(page, limit);
    }

    // 2. Extract string identifiers for user's assets in format "CODE:ISSUER" or "XLM:null"
    const userAssets = account.balances
      .filter(b => b.asset_type !== 'liquidity_pool_shares')
      .map(b => {
        if (b.asset_type === 'native') return 'XLM:null';
        return `${b.asset_code}:${b.asset_issuer}`;
      });

    const queryBuilder = this.poolRepository.createQueryBuilder("pool")
      .where("pool.isActive = :isActive", { isActive: true });

    // 3. Compute match score if user has assets
    if (userAssets.length > 0) {
      queryBuilder.addSelect(
        `(
          CASE WHEN CONCAT("pool"."assetACode", ':', COALESCE("pool"."assetAIssuer", 'null')) IN (:...userAssets) THEN 1 ELSE 0 END
          +
          CASE WHEN CONCAT("pool"."assetBCode", ':', COALESCE("pool"."assetBIssuer", 'null')) IN (:...userAssets) THEN 1 ELSE 0 END
        )`,
        'matchScore'
      )
      .addSelect(
        `CASE WHEN ("pool"."assetACode" = 'USDC' AND "pool"."assetBCode" = 'XLM') OR ("pool"."assetACode" = 'XLM' AND "pool"."assetBCode" = 'USDC') THEN 1 ELSE 0 END`,
        'isUsdcXlm'
      )
        .setParameter('userAssets', userAssets)
        .orderBy('"isUsdcXlm"', 'DESC')
        .addOrderBy('"matchScore"', 'DESC')
        .addOrderBy('pool.totalTrustlines', 'DESC');
    } else {
      queryBuilder
        .addSelect(
          `CASE WHEN ("pool"."assetACode" = 'USDC' AND "pool"."assetBCode" = 'XLM') OR ("pool"."assetACode" = 'XLM' AND "pool"."assetBCode" = 'USDC') THEN 1 ELSE 0 END`,
          'isUsdcXlm'
        )
        .orderBy('"isUsdcXlm"', 'DESC')
        .addOrderBy('pool.totalTrustlines', 'DESC');
    }

    // 4. Paginate
    queryBuilder.skip(skip).take(limit);

    // getManyAndCount will run the query and return entities (the virtual matchScore column won't be mapped to entity, which is fine)
    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPool(id: string) {
    return this.poolRepository.findOne({ where: { id } });
  }

  async getPoolSnapshots(poolId: string, limit?: number) {
    const query = this.snapshotRepository.createQueryBuilder("snapshot")
      .where("snapshot.poolId = :poolId", { poolId })
      .orderBy("snapshot.snapshotAt", "ASC");

    if (limit) {
      query.take(limit); // we probably want the latest `limit` snapshots, but ordered ASC.
    }
    
    // Better logic for latest X records ordered ASC:
    if (limit) {
      const records = await this.snapshotRepository.find({
        where: { poolId },
        order: { snapshotAt: "DESC" },
        take: limit
      });
      return records.reverse();
    }

    return query.getMany();
  }

  async getPoolDashboard(poolId: string) {
    const pool = await this.getPool(poolId);
    if (!pool) return null;

    // Son 90 günün snapshotlarını çek
    const snapshots = await this.snapshotRepository.find({
      where: { poolId },
      order: { snapshotAt: "ASC" },
      take: 90,
    });

    let profile = "Balanced";
    try {
      const riskScore = await this.poolRepository.manager.query(
        `SELECT "riskLevel" FROM risk_scores WHERE "poolId" = $1 ORDER BY "calculatedAt" DESC LIMIT 1`,
        [poolId],
      );
      if (riskScore && riskScore.length > 0) {
        profile = riskScore[0].riskLevel;
      }
    } catch (e) {
      // Ignore if table doesn't exist or error
    }

    let totalSupplied = 0;
    let utilization = 0;
    let supplyApy = 0;
    let avg90dApy = 0;
    const chartData = [];
    let sumApy = 0;

    // --- 1. Calculate Real-Time Dashboard Metrics ---
    // Fetch live USD prices
    const priceAUsd = (await this.oracleService.getUsdPrice(pool.assetACode, pool.assetAIssuer)) || 0;
    const priceBUsd = (await this.oracleService.getUsdPrice(pool.assetBCode, pool.assetBIssuer)) || 0;
    
    // Live TVL
    totalSupplied = parseFloat(pool.reserveA) * priceAUsd + parseFloat(pool.reserveB) * priceBUsd;

    // Live 24h Volume from Stellar Expert
    let vol24h = 0;
    try {
      const axios = require("axios");
      const isTestnet = this.config.networkPassphrase.includes("Test");
      const networkType = isTestnet ? "testnet" : "public";
      const res = await axios.get(`https://api.stellar.expert/explorer/${networkType}/liquidity-pool/${pool.id}`);
      if (res.data && res.data.volume && res.data.volume.length === 2) {
        const volumeA = (res.data.volume[0]["1d"] || 0) / 10000000;
        const volumeB = (res.data.volume[1]["1d"] || 0) / 10000000;
        vol24h = volumeA * priceAUsd + volumeB * priceBUsd;
      }
    } catch (e) {
      // Fallback to latest snapshot if Expert API fails
      if (snapshots.length > 0) {
        vol24h = parseFloat(snapshots[snapshots.length - 1].volume24hUsd || "0");
      }
    }

    utilization = totalSupplied > 0 ? (vol24h / totalSupplied) * 100 : 0;
    supplyApy = totalSupplied > 0 ? ((vol24h * (pool.feeBp / 10000) * 365) / totalSupplied) * 100 : 0;

    // --- 2. Calculate Historical Chart Data ---
    if (snapshots.length > 0) {
      for (const s of snapshots) {
        const t = parseFloat(s.tvlUsd || "0");
        const v = parseFloat(s.volume24hUsd || "0");
        const apy = t > 0 ? ((v * (pool.feeBp / 10000) * 365) / t) * 100 : 0;
        sumApy += apy;

        chartData.push({
          timestamp: s.snapshotAt,
          supplyApy: apy,
          totalSupply: t,
        });
      }
      avg90dApy = sumApy / snapshots.length;
    }

    const assetName = `${pool.assetACode}-${pool.assetBCode} Prime`;

    return {
      vaultOverview: {
        totalSupplied: totalSupplied,
        totalBorrowed: 0,
        utilization: utilization,
        supplyApy: supplyApy,
        supplyApy90dAvg: avg90dApy,
      },
      strategyOverview: {
        name: assetName,
        profile: profile,
        description: `${assetName} is a liquidity provisioning strategy designed to enable superior risk-adjusted yields via allocation into highly liquid Stellar AMM markets.`,
      },
      chartData: chartData,
    };
  }
}
