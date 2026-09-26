import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AnchorService } from "./anchor.service";
import {
  BuildWithdrawPaymentDto,
  DepositDto,
  SimulateTransferDto,
  VerifyAnchorChallengeDto,
  WithdrawDto,
} from "./dto/deposit.dto";
import { JwtAuthGuard } from "../../core/auth/auth.guard";
import { CurrentUserPublicKey } from "../../shared/decorators/public-key.decorator";

const anchorTokenHeader = ApiHeader({
  name: "x-anchor-token",
  description: "Token from POST /api/v1/ramp/auth/token (anchor SEP-10)",
});

function requireToken(token?: string): string {
  if (!token) throw new UnauthorizedException("Missing x-anchor-token header");
  return token;
}

@ApiTags("ramp")
@Controller("api/v1/ramp")
export class AnchorController {
  constructor(private readonly anchorService: AnchorService) {}

  @Get("info")
  @ApiOperation({
    summary: "Anchor discovery (SEP-1) + supported assets (SEP-6 /info)",
  })
  info() {
    return this.anchorService.getInfo();
  }

  @Get("auth/challenge")
  @ApiOperation({ summary: "Get the anchor's SEP-10 challenge for a wallet" })
  challenge(@Query("publicKey") publicKey: string) {
    return this.anchorService.getChallenge(publicKey);
  }

  @Post("auth/token")
  @ApiOperation({
    summary: "Exchange a signed anchor challenge for an anchor token",
  })
  token(@Body() dto: VerifyAnchorChallengeDto) {
    return this.anchorService.verifyChallenge(dto.transaction);
  }

  @Get("quote")
  @anchorTokenHeader
  @ApiOperation({ summary: "SEP-38 indicative price, e.g. TRY -> USDC" })
  quote(
    @Query("sellAsset") sellAsset: string,
    @Query("buyAsset") buyAsset: string,
    @Query("sellAmount") sellAmount: string,
    @Headers("x-anchor-token") token?: string,
  ) {
    return this.anchorService.getPrice(
      { sellAsset, buyAsset, sellAmount },
      token,
    );
  }

  @Post("deposit")
  @ApiBearerAuth()
  @anchorTokenHeader
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "On-ramp: start a TRY -> USDC deposit (returns IBAN + reference)",
  })
  deposit(
    @CurrentUserPublicKey() publicKey: string,
    @Body() dto: DepositDto,
    @Headers("x-anchor-token") token?: string,
  ) {
    return this.anchorService.deposit(publicKey, dto, requireToken(token));
  }

  @Post("deposit/:id/simulate-transfer")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Sandbox only: simulate the incoming TRY bank transfer for a deposit",
  })
  simulateTransfer(@Param("id") id: string, @Body() dto: SimulateTransferDto) {
    return this.anchorService.simulateBankTransfer(id, dto.amount);
  }

  @Post("withdraw")
  @ApiBearerAuth()
  @anchorTokenHeader
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Off-ramp: start a USDC -> TRY withdrawal (returns treasury + memo)",
  })
  withdraw(
    @CurrentUserPublicKey() publicKey: string,
    @Body() dto: WithdrawDto,
    @Headers("x-anchor-token") token?: string,
  ) {
    return this.anchorService.withdraw(publicKey, dto, requireToken(token));
  }

  @Post("withdraw/build-payment")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Build the unsigned USDC payment XDR (with memo) for the wallet to sign",
  })
  buildPayment(
    @CurrentUserPublicKey() publicKey: string,
    @Body() dto: BuildWithdrawPaymentDto,
  ) {
    return this.anchorService.buildWithdrawPaymentXdr(publicKey, dto);
  }

  @Get("transactions/:id")
  @ApiBearerAuth()
  @anchorTokenHeader
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Track a ramp transaction (SEP-6 /transaction)" })
  transaction(
    @Param("id") id: string,
    @Headers("x-anchor-token") token?: string,
  ) {
    return this.anchorService.getTransaction(id, requireToken(token));
  }
}
