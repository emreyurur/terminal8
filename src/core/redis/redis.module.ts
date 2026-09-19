import { Module, Global } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { redisStore } from "cache-manager-ioredis-yet";
import { RedisService } from "./redis.service";

const redisOptions = (configService: ConfigService, db: number) => ({
  host: configService.get<string>("REDIS_HOST", "localhost"),
  port: configService.get<number>("REDIS_PORT", 6379),
  password: configService.get<string>("REDIS_PASSWORD") || undefined,
  tls: configService.get<string>("REDIS_TLS") === "true" ? {} : undefined,
  db,
});

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        // Cache için varsayılan DB 0 (Upstash yalnızca 0 destekler)
        ...redisOptions(configService, configService.get<number>("REDIS_CACHE_DB", 0)),
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // Queue broker için varsayılan DB 1 (Upstash'te REDIS_QUEUE_DB=0 ayarlanmalı)
        connection: redisOptions(configService, configService.get<number>("REDIS_QUEUE_DB", 1)),
      }),
    }),
  ],
  providers: [RedisService],
  exports: [CacheModule, BullModule, RedisService],
})
export class RedisModule {}
