import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty } from "class-validator";

export class BuildTrustMintTxDto {
  @ApiProperty({
    description:
      "The user public key (wallet address) that will trust and receive the minted tokens",
    example: "G...",
  })
  @IsNotEmpty()
  @IsString()
  userPublicKey: string;

  @ApiProperty({
    description: "The token code to trust and mint (e.g. terminal)",
    example: "terminal",
  })
  @IsNotEmpty()
  @IsString()
  tokenCode: string;

  @ApiProperty({ description: "Amount of token to mint", example: "50000" })
  @IsNotEmpty()
  @IsString()
  amount: string;
}
