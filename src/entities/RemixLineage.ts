import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("remix_lineage")
export class RemixLineage {
  @PrimaryColumn({ type: "varchar" })
  id: string;

  @Column({ type: "varchar", name: "remix_project_id", unique: true })
  remixProjectId: string;

  @Column({ type: "varchar", name: "source_project_id", nullable: true })
  sourceProjectId: string | null;

  @Column({ type: "varchar", name: "remixer_id" })
  remixerId: string;

  @Column({ type: "jsonb", default: () => "'[]'" })
  lineage: unknown[];

  @Column({ type: "int", default: 1 })
  depth: number;

  @Column({ type: "jsonb", default: {} })
  attribution: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @Column({ type: "timestamp", name: "accepted_at", nullable: true })
  acceptedAt: Date | null;
}
