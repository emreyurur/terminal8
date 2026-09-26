import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HistoryModule } from "../history/history.module";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";
import { EmailService } from "./email.service";
import { AlertNotification } from "./entities/alert-notification.entity";
import { PriceAlert } from "./entities/price-alert.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([PriceAlert, AlertNotification]),
    HistoryModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService, EmailService],
})
export class AlertsModule {}
