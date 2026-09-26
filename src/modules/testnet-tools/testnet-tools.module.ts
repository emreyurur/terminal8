import { Module } from "@nestjs/common";
import { TestnetToolsController } from "./testnet-tools.controller";
import { TestnetToolsService } from "./testnet-tools.service";
import { HistoryModule } from "../history/history.module";

@Module({
  imports: [HistoryModule],
  controllers: [TestnetToolsController],
  providers: [TestnetToolsService],
})
export class TestnetToolsModule {}
