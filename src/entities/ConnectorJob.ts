import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("connector_jobs")
export class ConnectorJob {
  @PrimaryColumn({ type: "varchar" })
  id: string;

  @Column({ type: "varchar", name: "user_id" })
  userId: string;

  @Column({ type: "jsonb", default: {} })
  job: Record<string, unknown>;

  @Column({ type: "varchar", default: "queued" })
  status: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
