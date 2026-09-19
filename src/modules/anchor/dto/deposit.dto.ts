import { IsNumberString, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class DepositDto {
  @ApiPropertyOptional({ description: "TRY amount to deposit" })
  @IsNumberString()
  @IsOptional()
  amount?: string;

  @ApiPropertyOptional({ description: "SEP-38 quote id to lock the rate" })
  @IsString()
  @IsOptional()
  quoteId?: string;
}

export class WithdrawDto {
  @ApiProperty({ description: "Destination IBAN for the TRY payout" })
  @IsString()
  dest: string;

  @ApiPropertyOptional({ description: "USDC amount to withdraw" })
  @IsNumberString()
  @IsOptional()
  amount?: string;

  @ApiPropertyOptional({ description: "SEP-38 quote id to lock the rate" })
  @IsString()
  @IsOptional()
  quoteId?: string;
}

export class VerifyAnchorChallengeDto {
  @ApiProperty({ description: "Challenge XDR signed by the user's wallet" })
  @IsString()
  transaction: string;
}

export class BuildWithdrawPaymentDto {
  @ApiProperty({ description: "USDC amount to send to the anchor" })
  @IsNumberString()
  amount: string;

  @ApiProperty({ description: "Anchor treasury account (withdraw_anchor_account)" })
  @IsString()
  anchorAccount: string;

  @ApiProperty({ description: "Memo returned by the anchor's withdraw response" })
  @IsString()
  memo: string;

  @ApiPropertyOptional({ description: "text | id | hash (default: text)" })
  @IsString()
  @IsOptional()
  memoType?: string;
}

export class SimulateTransferDto {
  @ApiPropertyOptional({ description: "TRY amount that 'arrives' (defaults to the deposit amount)" })
  @IsNumberString()
  @IsOptional()
  amount?: string;
}
