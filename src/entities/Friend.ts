import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("friends")
export class Friend {
  @PrimaryColumn({ type: "varchar", name: "user_id" })
  userId: string;

  @PrimaryColumn({ type: "varchar", name: "friend_id" })
  friendId: string;

  @Column({ type: "varchar", default: "pending" })
  status: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
