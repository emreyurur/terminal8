import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty } from "class-validator";

export class SubmitMintTxDto {
  @ApiProperty({ description: "The signed XDR of the mint transaction" })
  @IsNotEmpty()
  @IsString()
  signedXdr: string;

  @ApiProperty({ description: "The token code that was minted" })
  @IsNotEmpty()
  @IsString()
  tokenCode: string;

  @ApiProperty({ description: "The amount that was minted" })
  @IsNotEmpty()
  @IsString()
  amount: string;

  @ApiProperty({
    description: "The destination wallet that received the token",
  })
  @IsNotEmpty()
  @IsString()
  destination: string;
}
