import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserPosition } from "./entities/user-position.entity";
import { PositionSnapshot } from "./entities/position-snapshot.entity";
import { PortfolioService } from "./portfolio.service";
import { PortfolioController } from "./portfolio.controller";
import { PnlCalculator } from "./pnl.calculator";
import { ScoutModule } from "../scout/scout.module";
import { HistoryModule } from "../history/history.module";
import { RiskModule } from "../risk/risk.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPosition, PositionSnapshot]),
    ScoutModule,
    HistoryModule,
    RiskModule,
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService, PnlCalculator],
  exports: [PortfolioService],
})
export class PortfolioModule {}
