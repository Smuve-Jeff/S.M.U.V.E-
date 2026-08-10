import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("studio_sessions")
export class StudioSession {
  @PrimaryColumn({ type: "varchar" })
  id: string;

  @Column({ type: "varchar", name: "project_id", nullable: true })
  projectId: string | null;

  @Column({ type: "varchar", name: "created_by_id" })
  createdById: string;

  @Column({ type: "varchar", default: "active" })
  status: string;

  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
