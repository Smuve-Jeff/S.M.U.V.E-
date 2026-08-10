import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("studio_session_members")
export class StudioSessionMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", name: "session_id" })
  sessionId: string;

  @Column({ type: "varchar", name: "user_id" })
  userId: string;

  @Column({ type: "varchar" })
  role: string;

  @Column({ type: "varchar", default: "active" })
  status: string;

  @Column({ type: "jsonb", default: {} })
  permissions: Record<string, unknown>;

  @CreateDateColumn({ name: "joined_at" })
  joinedAt: Date;
}
