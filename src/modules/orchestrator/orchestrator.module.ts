import { Module } from "@nestjs/common";
import { OrchestratorService } from "./orchestrator.service";
import { OrchestratorController } from "./orchestrator.controller";
import { XdrBuilderService } from "./services/xdr-builder.service";
import { SlippageService } from "./services/slippage.service";
import { SingleAssetDepositService } from "./services/single-asset-deposit.service";
import { ScoutModule } from "../scout/scout.module";
import { RiskModule } from "../risk/risk.module";

@Module({
  imports: [ScoutModule, RiskModule],
  controllers: [OrchestratorController],
  providers: [
    OrchestratorService,
    XdrBuilderService,
    SlippageService,
    SingleAssetDepositService,
  ],
})
export class OrchestratorModule {}
