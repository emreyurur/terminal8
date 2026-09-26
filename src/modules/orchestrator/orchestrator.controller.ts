import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { OrchestratorService } from "./orchestrator.service";
import { BuildTransactionDto } from "./dto/transaction-request.dto";
import { BuiltTransactionDto } from "./dto/transaction-response.dto";
import { BuildSingleAssetDepositDto } from "./dto/single-asset-request.dto";
import { SingleAssetDepositService } from "./services/single-asset-deposit.service";
import { JwtAuthGuard } from "../../core/auth/auth.guard";
import { CurrentUserPublicKey } from "../../shared/decorators/public-key.decorator";

@ApiTags("transactions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/transactions")
export class OrchestratorController {
  constructor(
    private readonly orchestratorService: OrchestratorService,
    private readonly singleAssetDeposit: SingleAssetDepositService,
  ) {}

  @Post("build")
  @ApiOperation({ summary: "Build an unsigned XDR for deposit or withdrawal" })
  @ApiResponse({
    status: 201,
    description: "Base64 unsigned XDR",
    type: BuiltTransactionDto,
  })
  async buildTransaction(
    @CurrentUserPublicKey() publicKey: string,
    @Body() dto: BuildTransactionDto,
  ): Promise<BuiltTransactionDto> {
    return this.orchestratorService.buildTransaction(publicKey, dto);
  }

  @Post("single-asset-deposit")
  @ApiOperation({
    summary:
      "Build one XDR that swaps part of a single asset and deposits into the pool",
    description:
      "For users holding only one pool asset. Returns the unsigned XDR (trustlines if needed, strict-receive swap, LP deposit) and a plan describing the swap. All operations are atomic.",
  })
  async buildSingleAssetDeposit(
    @CurrentUserPublicKey() publicKey: string,
    @Body() dto: BuildSingleAssetDepositDto,
  ) {
    return this.singleAssetDeposit.build(publicKey, dto);
  }

  // Frontend bu XDR'ı alıp imzalar ve Stellar ağına gönderir.
  // (Eğer backend üzerinden Horizon submit edilecekse confirm endpointi buraya eklenebilir)
}
