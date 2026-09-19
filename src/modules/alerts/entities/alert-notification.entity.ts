import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** What the browser polls: one row per fired alert, also serves as the user's alert history. */
@Entity("alert_notifications")
export class AlertNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column("varchar", { length: 56 })
  userPublicKey: string;

  @Column("uuid")
  alertId: string;

  @Column("text")
  message: string;

  @Column("double precision")
  value: number;

  /** Whether the browser should raise a system notification for it. */
  @Column("boolean", { default: true })
  popup: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @Column("timestamptz", { nullable: true })
  readAt: Date | null;
}
