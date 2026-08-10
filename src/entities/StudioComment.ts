import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("studio_comments")
export class StudioComment {
  @PrimaryColumn({ type: "varchar" })
  id: string;

  @Column({ type: "varchar", name: "session_id" })
  sessionId: string;

  @Column({ type: "varchar", name: "project_id" })
  projectId: string;

  @Column({ type: "varchar", name: "branch_id", nullable: true })
  branchId: string | null;

  @Column({ type: "varchar", name: "checkpoint_id", nullable: true })
  checkpointId: string | null;

  @Column({ type: "varchar", name: "track_id", nullable: true })
  trackId: string | null;

  @Column({ type: "varchar", name: "clip_id", nullable: true })
  clipId: string | null;

  @Column({ type: "varchar", name: "user_id" })
  userId: string;

  @Column({ type: "text" })
  content: string;

  @Column({ type: "boolean", default: false })
  resolved: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
