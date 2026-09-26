import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { PortfolioService } from "./portfolio.service";
import { PortfolioResponseDto } from "./dto/portfolio-response.dto";
import { SyncPositionDto } from "./dto/sync-position.dto";
import { JwtAuthGuard } from "../../core/auth/auth.guard";
import { CurrentUserPublicKey } from "../../shared/decorators/public-key.decorator";

@ApiTags("portfolio")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/portfolio")
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get(":publicKey")
  @ApiOperation({ summary: "Get user portfolio (PnL, IL, Balances)" })
  @ApiResponse({ status: 200, type: PortfolioResponseDto })
  async getPortfolio(
    @Param("publicKey") publicKey: string,
  ): Promise<PortfolioResponseDto> {
    return this.portfolioService.getPortfolio(publicKey);
  }

  @Get("lending-dashboard/:publicKey")
  @ApiOperation({
    summary: "Get lending-style dashboard (using real AMM data)",
  })
  async getLendingDashboard(@Param("publicKey") publicKey: string) {
    return this.portfolioService.getLendingDashboard(publicKey);
  }

  @Get("chart/:publicKey/:poolId")
  @ApiOperation({ summary: "Get position value & interest chart data" })
  @ApiQuery({ name: "range", required: false, enum: ["7d", "30d", "90d"] })
  async getPositionChart(
    @Param("publicKey") publicKey: string,
    @Param("poolId") poolId: string,
    @Query("range") range: string = "30d",
  ) {
    return this.portfolioService.getPositionChartData(publicKey, poolId, range);
  }

  @Post("sync")
  @ApiOperation({ summary: "Sync user position after successful transaction" })
  async syncPosition(
    @CurrentUserPublicKey() publicKey: string,
    @Body() dto: SyncPositionDto,
  ) {
    await this.portfolioService.syncPosition(
      publicKey,
      dto.poolId,
      dto.sharesAmount,
      dto.assetAAmount,
      dto.assetBAmount,
    );
    return { success: true };
  }
}
