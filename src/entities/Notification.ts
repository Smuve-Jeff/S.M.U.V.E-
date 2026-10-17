import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", name: "user_id" })
  userId: string;

  @Column({ type: "varchar" })
  type: string;

  @Column({ type: "varchar" })
  title: string;

  @Column({ type: "text" })
  body: string;

  @Column({ type: "jsonb", default: {} })
  payload: Record<string, unknown>;

  @Column({ type: "boolean", default: false, name: "is_read" })
  isRead: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
