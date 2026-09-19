import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import axios from "axios";
import { appConfig } from "../../config/app.config";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Sends alert emails through Resend. Without RESEND_API_KEY the channel is off and nothing is sent. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>) {}

  get enabled(): boolean {
    return Boolean(this.config.resendApiKey);
  }

  async sendAlert(to: string, subject: string, message: string, details: string[]): Promise<boolean> {
    if (!this.enabled) return false;
    const lines = [message, ...details];
    try {
      await axios.post(
        "https://api.resend.com/emails",
        {
          from: this.config.alertFromEmail,
          to: [to],
          subject,
          text: `${lines.join("\n")}\n\nThis alert fired once and is now paused. Re-arm it from the Alerts page in Terminal8.`,
          html: `<p><strong>${escapeHtml(message)}</strong></p>${details
            .map((d) => `<p>${escapeHtml(d)}</p>`)
            .join("")}<p style="color:#666">This alert fired once and is now paused. Re-arm it from the Alerts page in Terminal8.</p>`,
        },
        {
          headers: { Authorization: `Bearer ${this.config.resendApiKey}` },
          timeout: 10000,
        },
      );
      return true;
    } catch (e) {
      this.logger.error(`Email to ${to} failed: ${e.response?.data?.message || e.message}`);
      return false;
    }
  }
}
