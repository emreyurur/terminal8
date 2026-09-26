import { Controller, Post, Body, NotFoundException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { TestnetToolsService } from "./testnet-tools.service";
import { BuildLpTxDto } from "./dto/build-lp-tx.dto";
import { BuildTrustMintTxDto } from "./dto/build-trust-mint-tx.dto";
import { SubmitMintTxDto } from "./dto/submit-mint-tx.dto";

@ApiTags("testnet-tools")
@Controller("api/v1/pools/testnet")
export class TestnetToolsController {
  constructor(private readonly testnetToolsService: TestnetToolsService) {}

  @Post("build-lp-tx")
  @ApiOperation({
    summary: "Build an LP creation transaction (XLM-Token or Token-Token)",
    description:
      'Generates a partially signed XDR for Liquidity Pool creation. \n\n**How to use:**\n- For **XLM-Token Pool**: Set `tokenA: "XLM"` and `tokenB: "TOKEN_CODE"`.\n- For **Token-Token Pool**: Set `tokenA: "TOKEN1"` and `tokenB: "TOKEN2"`.\n\nThe backend will automatically handle lexicographic sorting, trustlines, and minting (if mintAmount is provided). The returned XDR must be signed by the user on the frontend and submitted to the network.',
  })
  @ApiResponse({
    status: 201,
    description: "Returns base64 encoded XDR for frontend signing",
  })
  @ApiResponse({ status: 400, description: "Bad Request / Failed to Build" })
  async buildLpTx(@Body() dto: BuildLpTxDto) {
    try {
      const result =
        await this.testnetToolsService.buildLiquidityPoolTransaction(dto);
      return result;
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  @Post("build-trust-mint-tx")
  @ApiOperation({
    summary: "Build a transaction to trust and mint a token",
    description:
      "Generates an XDR containing both a ChangeTrust operation and a Payment (mint) operation to the user. \n\nThe system uses the default backend testnet issuer and partially signs the transaction for the mint operation. The returned XDR must be signed by the user on the frontend.",
  })
  @ApiResponse({
    status: 201,
    description: "Returns base64 encoded XDR for frontend signing",
  })
  @ApiResponse({ status: 400, description: "Bad Request / Failed to Build" })
  async buildTrustMintTx(@Body() dto: BuildTrustMintTxDto) {
    try {
      const result =
        await this.testnetToolsService.buildTrustAndMintTransaction(dto);
      return result;
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  @Post("submit-mint-tx")
  @ApiOperation({
    summary: "Submit a signed mint transaction and log it",
    description:
      "Takes a fully signed XDR (signed via Freighter on the frontend), submits it to the Stellar testnet, and logs the MINT operation to the local history database upon success.",
  })
  @ApiResponse({
    status: 201,
    description: "Transaction submitted successfully",
  })
  @ApiResponse({ status: 400, description: "Failed to submit" })
  async submitMintTx(@Body() dto: SubmitMintTxDto) {
    try {
      const result = await this.testnetToolsService.submitAndLogMint(dto);
      return result;
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }
}
