import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { HistoryService } from "./history.service";
import { JwtAuthGuard } from "../../core/auth/auth.guard";
import { CurrentUserPublicKey } from "../../shared/decorators/public-key.decorator";

@ApiTags("history")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/history")
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @ApiOperation({
    summary: "Get overall transaction history for the logged in user",
  })
  @ApiResponse({ status: 200, description: "Paginated history list" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "page", required: false, type: Number })
  async getMyHistory(
    @CurrentUserPublicKey() publicKey: string,
    @Query("limit") limit?: number,
    @Query("page") page?: number,
  ) {
    return this.historyService.getUserHistory(
      publicKey,
      limit || 50,
      page || 1,
    );
  }

  @Get("sync-now")
  async forceSync() {
    await this.historyService.syncTransactions();
    return { success: true, message: "Sync completed" };
  }

  @Get(":poolId")
  @ApiOperation({
    summary: "Get transaction history filtered by a specific pool",
  })
  @ApiResponse({ status: 200, description: "Paginated pool history list" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "page", required: false, type: Number })
  async getMyPoolHistory(
    @CurrentUserPublicKey() publicKey: string,
    @Param("poolId") poolId: string,
    @Query("limit") limit?: number,
    @Query("page") page?: number,
  ) {
    return this.historyService.getUserHistoryByPool(
      publicKey,
      poolId,
      limit || 50,
      page || 1,
    );
  }
}
