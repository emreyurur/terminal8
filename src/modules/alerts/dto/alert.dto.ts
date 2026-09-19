import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ALERT_METRICS, AlertCondition, AlertMetric, QuoteSide } from "../alert-metrics";

export class CreateAlertDto {
  @ApiProperty({ description: "Liquidity pool ID (64 hex chars)" })
  @Matches(/^[0-9a-fA-F]{64}$/, { message: "poolId must be a 64 character hex pool id" })
  poolId: string;

  @ApiProperty({ enum: ALERT_METRICS })
  @IsIn(ALERT_METRICS)
  metric: AlertMetric;

  @ApiProperty({ enum: ["ABOVE", "BELOW"] })
  @IsIn(["ABOVE", "BELOW"])
  condition: AlertCondition;

  @ApiProperty({ description: "Value that triggers the alert (percent for IMPERMANENT_LOSS_PCT)" })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  threshold: number;

  @ApiPropertyOptional({ enum: ["A", "B"], description: "Pool asset the price / value is expressed in (default A)" })
  @IsIn(["A", "B"])
  @IsOptional()
  quoteSide?: QuoteSide;

  @ApiProperty()
  @IsBoolean()
  notifyBrowser: boolean;

  @ApiProperty()
  @IsBoolean()
  notifyEmail: boolean;

  @ApiPropertyOptional({ description: "Required when notifyEmail is true" })
  @ValidateIf((o) => o.notifyEmail === true)
  @IsEmail()
  email?: string;
}

export class UpdateAlertDto {
  @ApiPropertyOptional({ enum: ["ABOVE", "BELOW"] })
  @IsIn(["ABOVE", "BELOW"])
  @IsOptional()
  condition?: AlertCondition;

  @ApiPropertyOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsOptional()
  threshold?: number;

  @ApiPropertyOptional({ enum: ["A", "B"] })
  @IsIn(["A", "B"])
  @IsOptional()
  quoteSide?: QuoteSide;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  notifyBrowser?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  notifyEmail?: boolean;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ enum: ["ACTIVE", "PAUSED"], description: "ACTIVE re-arms a triggered alert" })
  @IsIn(["ACTIVE", "PAUSED"])
  @IsOptional()
  status?: "ACTIVE" | "PAUSED";
}

export class MarkReadDto {
  @ApiPropertyOptional({ type: [Number], description: "Notification ids; omit to mark all as read" })
  @IsNumber({}, { each: true })
  @IsOptional()
  ids?: number[];
}

export class CurrentValueQueryDto {
  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/)
  poolId: string;

  @IsIn(ALERT_METRICS)
  metric: AlertMetric;

  @IsIn(["A", "B"])
  @IsOptional()
  quoteSide?: QuoteSide;
}
