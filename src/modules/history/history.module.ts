import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TransactionHistory } from './entities/transaction-history.entity';
import { PoolIndexerState } from './entities/pool-indexer-state.entity';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { IndexerProcessor } from './indexer.processor';
import { ScoutModule } from '../scout/scout.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionHistory, PoolIndexerState]),
    BullModule.registerQueue({
      name: 'history-indexer',
    }),
    ScoutModule,
  ],
  controllers: [HistoryController],
  providers: [HistoryService, IndexerProcessor],
  exports: [HistoryService],
})
export class HistoryModule {
  constructor(
    @InjectQueue('history-indexer') private readonly indexerQueue: Queue,
  ) {}

  async onModuleInit() {
    // Run the indexer every 5 minutes
    await this.indexerQueue.add(
      'sync-transactions',
      {},
      {
        repeat: { pattern: '*/5 * * * *' }, // every 5 minutes
      },
    );

    // Initial run on boot (10 seconds delay to let everything initialize)
    await this.indexerQueue.add(
      'sync-transactions',
      {},
      {
        delay: 10_000,
        jobId: 'initial-sync-transactions',
      },
    );
  }
}
