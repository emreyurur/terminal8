import { Module, Global } from "@nestjs/common";
import { OracleService } from "./oracle.service";
import { RedisModule } from "../../core/redis/redis.module";

@Global()
@Module({
  imports: [RedisModule],
  providers: [OracleService],
  exports: [OracleService],
})
export class OracleModule {}
