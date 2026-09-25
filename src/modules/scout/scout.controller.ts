import {
  Controller,
  Get,
  Post,
  Param,
  NotFoundException,
  Query,
  Body,
} from "@nestjs/common";

import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { ScoutService } from "./scout.service";
import { PoolResponseDto } from "./dto/pool-response.dto";
import { LiquidityPool } from "./entities/liquidity-pool.entity";

@ApiTags("pools")
@Controller("api/v1/pools")
export class ScoutController {
  constructor(private readonly scoutService: ScoutService) { }

  @Get()
  @ApiOperation({ summary: "Get all active liquidity pools with pagination" })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number (default: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page (default: 50)",
  })
  @ApiResponse({ status: 200, description: "Paginated list of pools" })
  async getPools(@Query("page") page?: string, @Query("limit") limit?: string) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 50;
    return this.scoutService.getPools(pageNumber, limitNumber);
  }

  @Get("recommended/:pubkey")
  @ApiOperation({ summary: "Get recommended pools based on user's token balances" })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number (default: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page (default: 50)",
  })
  @ApiResponse({ status: 200, description: "Paginated and ranked list of pools" })
  async getRecommendedPools(
    @Param("pubkey") pubkey: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 50;
    return this.scoutService.getRecommendedPools(pubkey, pageNumber, limitNumber);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a specific pool by ID" })
  @ApiResponse({
    status: 200,
    description: "Pool details",
    type: PoolResponseDto,
  })
  @ApiResponse({ status: 404, description: "Pool not found" })
  async getPool(@Param("id") id: string): Promise<LiquidityPool> {
    const pool = await this.scoutService.getPool(id);
    if (!pool) {
      throw new NotFoundException(`Pool ${id} not found`);
    }
    return pool;
  }

  @Get(":id/dashboard")
  @ApiOperation({
    summary: "Get vault overview and dashboard data for a specific pool",
  })
  @ApiResponse({ status: 200, description: "Vault dashboard data" })
  @ApiResponse({ status: 404, description: "Pool not found" })
  async getPoolDashboard(@Param("id") id: string) {
    const dashboard = await this.scoutService.getPoolDashboard(id);
    if (!dashboard) {
      throw new NotFoundException(`Pool ${id} not found`);
    }
    return dashboard;
  }

  @Post("snapshot")
  @ApiOperation({ summary: "Manually trigger a snapshot for all active pools" })
  @ApiResponse({ status: 201, description: "Snapshot process started" })
  async triggerSnapshot() {
    // Süreç arka planda devam eder, kullanıcıya hemen cevap döner
    this.scoutService.takeDailySnapshots().catch(() => { });
    return { message: "Snapshot process started in background" };
  }
}
