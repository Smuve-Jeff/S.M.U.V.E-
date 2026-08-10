import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("projects")
export class Project {
  @PrimaryColumn({ type: "varchar", name: "project_id" })
  projectId: string;

  @Column({ type: "varchar", name: "user_id" })
  userId: string;

  @Column({ type: "varchar" })
  title: string;

  @Column({ type: "jsonb", name: "project_data", default: {} })
  projectData: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
