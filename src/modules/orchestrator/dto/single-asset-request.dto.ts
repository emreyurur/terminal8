import { IsNumber, IsOptional, IsPositive, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class BuildSingleAssetDepositDto {
  @ApiProperty({ description: "Liquidity pool ID (64 hex chars)" })
  @IsString()
  poolId: string;

  @ApiProperty({
    description:
      "The pool asset the user holds: code (e.g. XLM, USDC) or CODE:ISSUER when both sides share a code",
  })
  @IsString()
  sourceAsset: string;

  @ApiProperty({ description: "Total amount of sourceAsset to put into the pool" })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: "Slippage tolerance in bps", required: false })
  @IsNumber()
  @IsOptional()
  slippageBps?: number;
}
