import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../core/auth/auth.guard";
import { CurrentUserPublicKey } from "../../shared/decorators/public-key.decorator";
import { AlertsService } from "./alerts.service";
import {
  CreateAlertDto,
  CurrentValueQueryDto,
  MarkReadDto,
  UpdateAlertDto,
} from "./dto/alert.dto";

@ApiTags("alerts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/alerts")
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get("config")
  @ApiOperation({
    summary: "Which channels are available and the alert limits",
  })
  config() {
    return this.alerts.getConfig();
  }

  @Get("current")
  @ApiOperation({
    summary: "Current value of a metric, to help pick a threshold",
  })
  current(
    @CurrentUserPublicKey() publicKey: string,
    @Query() q: CurrentValueQueryDto,
  ) {
    return this.alerts.currentValue(publicKey, q.poolId, q.metric, q.quoteSide);
  }

  @Get("notifications")
  @ApiOperation({
    summary: "Fired alerts. Use unread=true to poll for new ones",
  })
  notifications(
    @CurrentUserPublicKey() publicKey: string,
    @Query("unread") unread?: string,
  ) {
    return this.alerts.listNotifications(publicKey, unread === "true");
  }

  @Post("notifications/read")
  @ApiOperation({
    summary: "Mark notifications as read (all when ids is omitted)",
  })
  markRead(
    @CurrentUserPublicKey() publicKey: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.alerts.markRead(publicKey, dto.ids);
  }

  @Get()
  @ApiOperation({ summary: "List your alerts" })
  list(@CurrentUserPublicKey() publicKey: string) {
    return this.alerts.list(publicKey);
  }

  @Post()
  @ApiOperation({ summary: "Create an alert on a pool" })
  create(
    @CurrentUserPublicKey() publicKey: string,
    @Body() dto: CreateAlertDto,
  ) {
    return this.alerts.create(publicKey, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit, pause, or re-arm an alert" })
  update(
    @CurrentUserPublicKey() publicKey: string,
    @Param("id") id: string,
    @Body() dto: UpdateAlertDto,
  ) {
    return this.alerts.update(publicKey, id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete an alert and its history" })
  remove(@CurrentUserPublicKey() publicKey: string, @Param("id") id: string) {
    return this.alerts.remove(publicKey, id);
  }
}
