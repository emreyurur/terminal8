import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TransactionHistory, TransactionType } from './entities/transaction-history.entity';
import { PoolIndexerState } from './entities/pool-indexer-state.entity';
import { HorizonClient } from '../scout/horizon/horizon.client';
import { Inject } from '@nestjs/common';
import { appConfig } from '../../config/app.config';
import { ConfigType } from '@nestjs/config';

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    @InjectRepository(TransactionHistory)
    private readonly historyRepository: Repository<TransactionHistory>,
    @InjectRepository(PoolIndexerState)
    private readonly indexerStateRepository: Repository<PoolIndexerState>,
    private readonly dataSource: DataSource,
    private readonly horizonClient: HorizonClient,
    @Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>,
  ) {}

  async logTransaction(params: {
    operationId: string;
    userPublicKey: string;
    poolId?: string;
    type: TransactionType;
    assetA: string;
    amountA: string;
    assetB?: string;
    amountB?: string;
    tx?: string;
    occurredAt: Date;
    sharesAmount?: string;
  }, manager?: any) {
    try {
      const repo = manager ? manager.getRepository(TransactionHistory) : this.historyRepository;
      
      await repo.createQueryBuilder()
        .insert()
        .into(TransactionHistory)
        .values(params)
        .orIgnore() // ON CONFLICT DO NOTHING (relies on operationId unique constraint)
        .execute();
        
      this.logger.debug(`Logged ${params.type} for ${params.userPublicKey} op: ${params.operationId}`);
    } catch (error) {
      this.logger.error(`Failed to log transaction: ${error.message}`);
    }
  }

  async getUserHistory(publicKey: string, limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    
    const [data, total] = await this.historyRepository.findAndCount({
      where: { userPublicKey: publicKey },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: skip,
    });

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit)
    };
  }

  async getUserHistoryByPool(publicKey: string, poolId: string, limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    
    const [data, total] = await this.historyRepository.findAndCount({
      where: { userPublicKey: publicKey, poolId: poolId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: skip,
    });

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit)
    };
  }

  async getAllUserHistoryByPool(publicKey: string, poolId: string): Promise<TransactionHistory[]> {
    return this.historyRepository.find({
      where: { userPublicKey: publicKey, poolId },
      order: { occurredAt: 'ASC' }
    });
  }

  async syncTransactions() {
    this.logger.log('Starting historical transaction sync...');
    
    // Fetch top 30 pools + pools that active users have interacted with
    const poolsToSyncResult = await this.dataSource.query(`
      SELECT id FROM (
        SELECT id FROM liquidity_pools ORDER BY "totalTrustlines" DESC LIMIT 30
      ) as top_pools
      UNION
      SELECT "poolId" as id FROM user_positions
      UNION
      SELECT "poolId" as id FROM transaction_history WHERE "poolId" IS NOT NULL
    `);

    const targetPoolIds: string[] = poolsToSyncResult.map((p: any) => p.id);
    this.logger.log(`Found ${targetPoolIds.length} target pools to index.`);

    for (const poolId of targetPoolIds) {
      try {
        let state = await this.indexerStateRepository.findOne({ where: { poolId } });
        if (!state) {
          state = this.indexerStateRepository.create({ poolId, lastPagingToken: '0', isFullySynced: false });
        }

        let pagesFetched = 0;
        let hasMore = true;

        while (hasMore) {
          // Break if fully synced and we just checked some pages, or if hard limit reached in one run to avoid memory bloat
          if (state.isFullySynced && pagesFetched >= 2) break;
          if (pagesFetched >= 20) break;

          const response = await this.horizonClient.fetchPoolOperations(poolId, state.lastPagingToken, 200);
          const records = response.records;
          
          if (records.length === 0) {
            hasMore = false;
            state.isFullySynced = true;
            await this.indexerStateRepository.save(state);
            break;
          }

          const queryRunner = this.dataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();

          let addedCount = 0;
          let lastPagingToken = state.lastPagingToken;

          try {
            const transactionsToInsert: any[] = [];

            for (const op of records) {
              let txType: TransactionType;
              let assetA = '';
              let amountA = '';
              let assetB = '';
              let amountB = '';
              let sharesAmount = '0';
              
              if (op.type === 'liquidity_pool_deposit') {
                txType = TransactionType.DEPOSIT;
                const depOp = op as any;
                sharesAmount = depOp.shares_received || '0';
                const reserves = depOp.reserves_deposited || depOp.reserves_max;
                if (reserves && reserves.length === 2) {
                  assetA = reserves[0].asset || 'XLM';
                  amountA = reserves[0].amount;
                  assetB = reserves[1].asset || 'XLM';
                  amountB = reserves[1].amount;
                }
              } else if (op.type === 'liquidity_pool_withdraw') {
                txType = TransactionType.WITHDRAW;
                const witOp = op as any;
                sharesAmount = witOp.shares || '0';
                const reserves = witOp.reserves_received || witOp.reserves_min;
                if (reserves && reserves.length === 2) {
                  assetA = reserves[0].asset || 'XLM';
                  amountA = reserves[0].amount;
                  assetB = reserves[1].asset || 'XLM';
                  amountB = reserves[1].amount;
                }
              } else if (op.type === 'path_payment_strict_send' || op.type === 'path_payment_strict_receive') {
                txType = TransactionType.SWAP;
                const swapOp = op as any;
                assetA = swapOp.source_asset_type === 'native' ? 'XLM' : swapOp.source_asset_code;
                amountA = swapOp.source_amount;
                assetB = swapOp.asset_type === 'native' ? 'XLM' : swapOp.asset_code;
                amountB = swapOp.amount;
              } else {
                lastPagingToken = op.paging_token;
                continue;
              }

              if (assetA && assetA.includes(':')) assetA = assetA.split(':')[0];
              if (assetB && assetB.includes(':')) assetB = assetB.split(':')[0];

              transactionsToInsert.push({
                operationId: op.id,
                occurredAt: new Date(op.created_at),
                sharesAmount,
                userPublicKey: op.source_account,
                poolId: poolId,
                type: txType,
                assetA: assetA || 'Unknown',
                amountA: amountA || '0',
                assetB: assetB,
                amountB: amountB,
                tx: op.transaction_hash,
              });

              addedCount++;
              lastPagingToken = op.paging_token;
            }

            if (transactionsToInsert.length > 0) {
              await queryRunner.manager.createQueryBuilder()
                .insert()
                .into(TransactionHistory)
                .values(transactionsToInsert)
                .orIgnore() // ON CONFLICT DO NOTHING
                .execute();
            }

            state.lastPagingToken = lastPagingToken;
            await queryRunner.manager.save(PoolIndexerState, state);
            await queryRunner.commitTransaction();
            
            if (addedCount > 0) {
              this.logger.debug(`Indexed ${addedCount} operations for pool ${poolId}`);
            }
          } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
          } finally {
            await queryRunner.release();
          }
          
          if (!response.hasMore) {
            hasMore = false;
            state.isFullySynced = true;
            await this.indexerStateRepository.save(state);
          }
          pagesFetched++;
        }
      } catch (err) {
        this.logger.error(`Error syncing pool ${poolId}: ${err.message}`);
      }
    }
    
    this.logger.log('Historical transaction sync completed.');
  }

  async calculateUserCostBasis(publicKey: string, poolId: string): Promise<{ costBasisA: string; costBasisB: string }> {
    const history = await this.historyRepository.find({
      where: { userPublicKey: publicKey, poolId },
      order: { occurredAt: 'ASC' }
    });

    let costBasisA = 0;
    let costBasisB = 0;
    let totalShares = 0;

    for (const tx of history) {
      const shares = parseFloat(tx.sharesAmount || '0');

      if (tx.type === TransactionType.DEPOSIT && shares > 0) {
        costBasisA += parseFloat(tx.amountA || '0');
        costBasisB += parseFloat(tx.amountB || '0');
        totalShares += shares;
      } else if (tx.type === TransactionType.WITHDRAW && totalShares > 0) {
        const remainingRatio = Math.max(0, (totalShares - shares) / totalShares);
        costBasisA *= remainingRatio;
        costBasisB *= remainingRatio;
        totalShares = Math.max(0, totalShares - shares);
      }
    }

    return {
      costBasisA: Math.max(0, costBasisA).toString(),
      costBasisB: Math.max(0, costBasisB).toString(),
    };
  }
}
