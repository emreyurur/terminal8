import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserPosition } from "./entities/user-position.entity";
import { PnlCalculator } from "./pnl.calculator";
import { PortfolioResponseDto } from "./dto/portfolio-response.dto";
import { ScoutService } from "../scout/scout.service";
import { HorizonClient } from "../scout/horizon/horizon.client";
import { Logger, Inject, forwardRef } from "@nestjs/common";
import { HistoryService } from "../history/history.service";
import { OracleService } from "../oracle/oracle.service";
import { OracleAsset } from "../oracle/oracle.types";
import { RiskService } from "../risk/risk.service";

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    @InjectRepository(UserPosition)
    private readonly positionRepository: Repository<UserPosition>,
    private readonly pnlCalculator: PnlCalculator,
    private readonly scoutService: ScoutService,
    private readonly horizonClient: HorizonClient,
    private readonly historyService: HistoryService,
    private readonly oracleService: OracleService,
    private readonly riskService: RiskService,
  ) {}

  async getPortfolio(publicKey: string): Promise<PortfolioResponseDto> {
    await this.syncBlockchainBalances(publicKey);

    const positions = await this.positionRepository.find({
      where: { userPublicKey: publicKey },
      relations: ["pool"],
    });

    let totalValueUsd = 0;
    let totalPnlUsd = 0;

    const positionDtos = [];

    for (const position of positions) {
      if (parseFloat(position.sharesOwned) === 0) continue;

      const pool = await this.scoutService.getPool(position.poolId);
      if (!pool) continue;

      const metrics = await this.pnlCalculator.calculatePositionMetrics(
        position,
        pool,
      );

      totalValueUsd += metrics.currentValueUsd;
      totalPnlUsd += metrics.pnlUsd;

      positionDtos.push({
        poolId: position.poolId,
        sharesOwned: position.sharesOwned,
        currentValueUsd: metrics.currentValueUsd,
        impermanentLossPct: metrics.impermanentLossPct,
        pnlUsd: metrics.pnlUsd,
      });
    }

    return {
      userPublicKey: publicKey,
      totalValueUsd,
      totalPnlUsd,
      positions: positionDtos,
    };
  }

  private async syncBlockchainBalances(publicKey: string) {
    try {
      const account = await this.horizonClient.fetchAccount(publicKey);
      if (!account || !account.balances) return;

      const lpBalances = account.balances.filter(b => b.asset_type === 'liquidity_pool_shares' && b.liquidity_pool_id);
      
      const dbPositions = await this.positionRepository.find({ where: { userPublicKey: publicKey } });

      // Update existing positions
      for (const pos of dbPositions) {
        const onChainMatch = lpBalances.find(b => b.liquidity_pool_id === pos.poolId);
        const actualShares = onChainMatch ? onChainMatch.balance : "0";
        
        // Always sync cost basis from exact history
        const costBasis = await this.historyService.calculateUserCostBasis(publicKey, pos.poolId);

        let changed = false;
        if (pos.sharesOwned !== actualShares) {
          pos.sharesOwned = actualShares;
          changed = true;
        }
        if (pos.assetADeposited !== costBasis.assetADeposited) {
          pos.assetADeposited = costBasis.assetADeposited;
          changed = true;
        }
        if (pos.assetBDeposited !== costBasis.assetBDeposited) {
          pos.assetBDeposited = costBasis.assetBDeposited;
          changed = true;
        }

        if (changed) {
          await this.positionRepository.save(pos);
        }
      }

      // Create missing positions if they have balances and the pool exists in our scout db
      for (const onChain of lpBalances) {
        const existsInDb = dbPositions.find(p => p.poolId === onChain.liquidity_pool_id);
        if (!existsInDb) {
          let poolExists = await this.scoutService.getPool(onChain.liquidity_pool_id!);
          if (!poolExists) {
            poolExists = await this.scoutService.forceFetchPool(onChain.liquidity_pool_id!);
          }
          if (poolExists) {
            const costBasis = await this.historyService.calculateUserCostBasis(publicKey, onChain.liquidity_pool_id!);
            
            const newPos = this.positionRepository.create({
              userPublicKey: publicKey,
              poolId: onChain.liquidity_pool_id!,
              sharesOwned: onChain.balance || "0",
              assetADeposited: costBasis.assetADeposited || "0",
              assetBDeposited: costBasis.assetBDeposited || "0",
              firstDepositAt: new Date(),
              lastUpdatedAt: new Date(),
            });
            await this.positionRepository.save(newPos);
          }
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to sync blockchain balances for ${publicKey}: ${e.message}`);
    }
  }

  // Frontend'den başarılı işlem sonrasında webhook/callback geldiğinde veya
  // Horizon üzerinden adresin geçmiş işlemleri tarandığında çağrılır
  async syncPosition(
    publicKey: string,
    poolId: string,
    sharesAmount: string,
    assetAAmount: string,
    assetBAmount: string,
  ) {
    let position = await this.positionRepository.findOne({
      where: { userPublicKey: publicKey, poolId },
    });

    if (!position) {
      position = this.positionRepository.create({
        userPublicKey: publicKey,
        poolId,
        sharesOwned: sharesAmount || "0",
        assetADeposited: assetAAmount || "0",
        assetBDeposited: assetBAmount || "0",
        firstDepositAt: new Date(),
        lastUpdatedAt: new Date(),
      });
    } else {
      // Eğer mevcutsa üzerine ekleniyor (basit logic, gerçekte average cost basis hesabı gerekir)
      position.sharesOwned = (
        parseFloat(position.sharesOwned || "0") + parseFloat(sharesAmount || "0")
      ).toString();
      position.assetADeposited = (
        parseFloat(position.assetADeposited || "0") + parseFloat(assetAAmount || "0")
      ).toString();
      position.assetBDeposited = (
        parseFloat(position.assetBDeposited || "0") + parseFloat(assetBAmount || "0")
      ).toString();
      position.lastUpdatedAt = new Date();
    }

    await this.positionRepository.save(position);
  }

  async getLendingDashboard(publicKey: string) {
    // 1. Calculate Global Market Size (Total TVL across all pools in the system)
    const allPools = await this.scoutService.getPools(1, 1000);
    let marketSizeUsd = 0;

    // Gather all unique assets across pools to batch fetch prices
    const oracleAssetsMap = new Map<string, OracleAsset>();
    for (const pool of allPools.data || []) {
      oracleAssetsMap.set(`${pool.assetACode}:${pool.assetAIssuer || 'native'}`, { code: pool.assetACode, issuer: pool.assetAIssuer });
      oracleAssetsMap.set(`${pool.assetBCode}:${pool.assetBIssuer || 'native'}`, { code: pool.assetBCode, issuer: pool.assetBIssuer });
    }
    const prices = await this.oracleService.getBatchUsdPrices(Array.from(oracleAssetsMap.values()));

    for (const pool of allPools.data || []) {
      const reserveA = parseFloat(pool.reserveA) || 0;
      const reserveB = parseFloat(pool.reserveB) || 0;
      
      const priceA = prices.get(pool.assetACode) || 0;
      const priceB = prices.get(pool.assetBCode) || 0;
      
      if (priceA > 0 && priceB > 0) {
        marketSizeUsd += reserveA * priceA + reserveB * priceB;
      } else if (priceA > 0) {
        marketSizeUsd += reserveA * priceA * 2;
      } else if (priceB > 0) {
        marketSizeUsd += reserveB * priceB * 2;
      }
    }

    await this.syncBlockchainBalances(publicKey);

    // 2. Fetch User Positions
    const positions = await this.positionRepository.find({
      where: { userPublicKey: publicKey },
      relations: ["pool"],
    });

    let vaultDepositsUsd = 0; // User's total value
    let totalPnlUsd = 0;
    const assets = [];

    for (const position of positions) {
      if (parseFloat(position.sharesOwned) === 0) continue;

      const pool = await this.scoutService.getPool(position.poolId);
      if (!pool) continue;

      const metrics = await this.pnlCalculator.calculatePositionMetrics(
        position,
        pool,
      );

      vaultDepositsUsd += metrics.currentValueUsd;
      totalPnlUsd += metrics.pnlUsd;

      const riskData = await this.riskService.getRiskByPoolId(pool.id);

      assets.push({
        poolId: position.poolId,
        assetName: `${pool.assetACode}-${pool.assetBCode} LP`,
        positionValueUsd: metrics.currentValueUsd,
        supplyApy: riskData?.estimatedApy || 0,
        impermanentLossPct: metrics.impermanentLossPct,
        interestEarnedUsd: metrics.pnlUsd, // Showing PnL as "Interest Earned"
        vaultProfile: riskData?.riskLevel || "Dynamic",
      });
    }

    return {
      globalStats: {
        marketSizeUsd,
        vaultDepositsUsd, // For this specific user, the "Vault Deposits" is their portfolio value
      },
      userOverview: {
        activePositions: positions.length,
        positionsValueUsd: vaultDepositsUsd,
        avgApy:
          assets.length > 0
            ? assets.reduce((acc, curr) => acc + curr.supplyApy, 0) /
              assets.length
            : 0,
        interestEarnedUsd: totalPnlUsd,
      },
      assets,
    };
  }
}
