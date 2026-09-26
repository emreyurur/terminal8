import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { AlertCondition, AlertMetric, QuoteSide } from "../alert-metrics";

export type AlertStatus = "ACTIVE" | "TRIGGERED" | "PAUSED";

@Entity("price_alerts")
export class PriceAlert {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column("varchar", { length: 56 })
  userPublicKey: string;

  @Column("varchar", { length: 64 })
  poolId: string;

  /** Asset codes captured at creation, so lists can show the pool name without another lookup. */
  @Column("varchar", { length: 12 })
  codeA: string;

  @Column("varchar", { length: 12 })
  codeB: string;

  @Column("varchar", { length: 24 })
  metric: AlertMetric;

  @Column("varchar", { length: 5 })
  condition: AlertCondition;

  @Column("double precision")
  threshold: number;

  @Column("varchar", { length: 1, default: "A" })
  quoteSide: QuoteSide;

  @Column("boolean", { default: true })
  notifyBrowser: boolean;

  @Column("boolean", { default: false })
  notifyEmail: boolean;

  @Column("varchar", { length: 254, nullable: true })
  email: string | null;

  @Index()
  @Column("varchar", { length: 10, default: "ACTIVE" })
  status: AlertStatus;

  @Column("double precision", { nullable: true })
  lastValue: number | null;

  @Column("timestamptz", { nullable: true })
  lastCheckedAt: Date | null;

  @Column("timestamptz", { nullable: true })
  triggeredAt: Date | null;

  @Column("double precision", { nullable: true })
  triggeredValue: number | null;

  @Column("varchar", { length: 8, nullable: true })
  emailStatus: "SENT" | "FAILED" | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
