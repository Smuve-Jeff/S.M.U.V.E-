import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("studio_approvals")
export class StudioApproval {
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

  @Column({ type: "varchar", name: "created_by_id" })
  createdById: string;

  @Column({ type: "text", array: true, name: "approver_ids", default: () => "'{}'" })
  approverIds: string[];

  @Column({ type: "jsonb", name: "approval_status", default: {} })
  approvalStatus: Record<string, unknown>;

  @Column({ type: "varchar", name: "overall_status", default: "pending" })
  overallStatus: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
