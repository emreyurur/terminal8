import { Entity, Column, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("pool_indexer_state")
export class PoolIndexerState {
  @PrimaryColumn()
  poolId: string;

  @Column({ default: "0" })
  lastPagingToken: string;

  @Column({ default: false })
  isFullySynced: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
