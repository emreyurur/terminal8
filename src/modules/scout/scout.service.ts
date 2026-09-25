import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
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
  ) { }

  async syncLiquidityPools() {
    this.logger.log("Starting liquidity pools sync...");
    const pools = await this.horizonClient.fetchAllPools();
    this.logger.log(`Fetched ${pools.length} pools from Horizon`);

    // Sort pools by trustlines descending to categorize them
    pools.sort((a, b) => Number(b.total_trustlines) - Number(a.total_trustlines));

    // Select a mix of 50 pools: 40 safe (top), 5 moderate, 5 risky
    const safePools = pools.slice(0, 40);
    const moderatePools = pools.slice(100, 105); // Arbitrary offset for moderate
    const riskyPools = pools.slice(1000, 1005); // Arbitrary offset for risky

    const selectedPools = [...safePools, ...moderatePools, ...riskyPools].filter(Boolean);
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
        const trades = await this.horizonClient.fetchPoolTrades(pool.id, 24);

        let volumeA = 0;
        let volumeB = 0;

        for (const trade of trades) {
          const baseCode = trade.base_asset_type === "native" ? "XLM" : trade.base_asset_code;
          const baseIssuer = trade.base_asset_issuer || null;

          if (baseCode === pool.assetACode && baseIssuer === pool.assetAIssuer) {
            volumeA += parseFloat(trade.base_amount);
            volumeB += parseFloat(trade.counter_amount);
          } else {
            volumeA += parseFloat(trade.counter_amount);
            volumeB += parseFloat(trade.base_amount);
          }
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
    const [data, total] = await this.poolRepository.findAndCount({
      where: { isActive: true },
      skip,
      take: limit,
      order: { totalTrustlines: "DESC" }, // Daha çok kullanılan havuzlar üstte
    });

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
        .setParameter('userAssets', userAssets)
        .orderBy('"matchScore"', 'DESC')
        .addOrderBy('pool.totalTrustlines', 'DESC');
    } else {
      queryBuilder.orderBy('pool.totalTrustlines', 'DESC');
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
        `SELECT risk_level FROM risk_scores WHERE pool_id = $1 ORDER BY calculated_at DESC LIMIT 1`,
        [poolId],
      );
      if (riskScore && riskScore.length > 0) {
        profile = riskScore[0].risk_level;
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

    if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      totalSupplied = parseFloat(latest.tvlUsd || "0");

      const vol24h = parseFloat(latest.volume24hUsd || "0");
      utilization = totalSupplied > 0 ? (vol24h / totalSupplied) * 100 : 0;

      // APY = (Volume * Fee * 365) / TVL
      supplyApy =
        totalSupplied > 0
          ? ((vol24h * (pool.feeBp / 10000) * 365) / totalSupplied) * 100
          : 0;

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
