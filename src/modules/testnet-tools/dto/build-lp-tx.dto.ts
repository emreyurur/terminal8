import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class BuildLpTxDto {
  @ApiProperty({
    description:
      "The user public key (wallet address) that will sign and submit the transaction",
    example: "G...",
  })
  @IsNotEmpty()
  @IsString()
  userPublicKey: string;

  @ApiProperty({
    description:
      'Asset A code. Use "XLM" for Native Asset, or the code of the custom token (e.g., "YRK").',
    example: "XLM",
  })
  @IsNotEmpty()
  @IsString()
  tokenA: string;

  @ApiProperty({
    description:
      'Asset B code. Use "XLM" for Native Asset, or the code of the custom token (e.g., "TERMINAL").',
    example: "YRK",
  })
  @IsNotEmpty()
  @IsString()
  tokenB: string;

  @ApiProperty({
    description: "Amount of Asset A to deposit into the LP",
    example: "1000",
  })
  @IsNotEmpty()
  @IsString()
  amountA: string;

  @ApiProperty({
    description: "Amount of Asset B to deposit into the LP",
    example: "1000",
  })
  @IsNotEmpty()
  @IsString()
  amountB: string;

  @ApiPropertyOptional({
    description:
      "Amount of Asset A to mint to the user before deposit (only if Asset A is a custom token)",
    example: "5000",
  })
  @IsOptional()
  @IsString()
  mintAmountA?: string;

  @ApiPropertyOptional({
    description:
      "Amount of Asset B to mint to the user before deposit (only if Asset B is a custom token)",
    example: "5000",
  })
  @IsOptional()
  @IsString()
  mintAmountB?: string;
}
