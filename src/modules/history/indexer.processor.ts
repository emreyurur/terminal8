import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { HistoryService } from "./history.service";

@Processor("history-indexer")
export class IndexerProcessor extends WorkerHost {
  private readonly logger = new Logger(IndexerProcessor.name);

  constructor(private readonly historyService: HistoryService) {
    super();
  }

  @OnWorkerEvent("active")
  onActive(job: Job) {
    this.logger.debug(`Processing indexer job ${job.name} (id: ${job.id})...`);
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case "sync-transactions":
        return this.historyService.syncTransactions();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
