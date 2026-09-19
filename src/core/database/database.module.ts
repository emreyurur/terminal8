import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        host: configService.get<string>("DB_HOST", "localhost"),
        port: configService.get<number>("DB_PORT", 5432),
        username: configService.get<string>("DB_USER", "terminal8"),
        password: configService.get<string>("DB_PASSWORD", "supersecret"),
        database: configService.get<string>("DB_NAME", "terminal8"),
        ssl: configService.get<string>("DB_SSL") === "true"
          ? { rejectUnauthorized: false }
          : false,
        autoLoadEntities: true,
        synchronize: true, // TODO: Üretimde false yapıp migration kullanılmalı
      }),
    }),
  ],
})
export class DatabaseModule {}
