import { Module, OnModuleInit } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { LiquidityPool } from "./entities/liquidity-pool.entity";
import { PoolSnapshot } from "./entities/pool-snapshot.entity";
import { HorizonClient } from "./horizon/horizon.client";
import { ScoutService } from "./scout.service";
import { ScoutProcessor } from "./scout.processor";
import { ScoutController } from "./scout.controller";
import { appConfig } from "../../config/app.config";
import { ConfigType } from "@nestjs/config";
import { Inject } from "@nestjs/common";

@Module({
  imports: [
    TypeOrmModule.forFeature([LiquidityPool, PoolSnapshot]),
    BullModule.registerQueue({
      name: "scout",
    }),
  ],
  controllers: [ScoutController],
  providers: [HorizonClient, ScoutService, ScoutProcessor],
  exports: [ScoutService, HorizonClient],
})
export class ScoutModule implements OnModuleInit {
  constructor(
    @InjectQueue("scout") private readonly scoutQueue: Queue,
    @Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>,
  ) {}

  async onModuleInit() {
    // BullMQ Repeatable Jobs
    await this.scoutQueue.add(
      "sync-pools",
      {},
      {
        repeat: { every: this.config.poolSyncIntervalMs },
      },
    );

    // Her gün gece yarısı snapshot al
    await this.scoutQueue.add(
      "daily-snapshot",
      {},
      {
        repeat: { pattern: "0 0 * * *" },
      },
    );

    // İlk çalıştırmada 30 saniye sonra bir snapshot tetikle (sync-pools'un bitmesini beklesin)
    await this.scoutQueue.add(
      "daily-snapshot",
      {},
      {
        delay: 30_000,
        jobId: "initial-snapshot", // Tekrar başlatıldığında çakışmasın
      },
    );
  }
}
