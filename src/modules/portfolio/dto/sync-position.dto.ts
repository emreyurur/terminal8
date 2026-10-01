import { ApiProperty } from "@nestjs/swagger";

export class SyncPositionDto {
  @ApiProperty()
  poolId: string;

  @ApiProperty()
  txHash: string;
}
