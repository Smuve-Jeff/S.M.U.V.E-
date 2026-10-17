import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("game_challenges")
export class GameChallenge {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", name: "from_user_id" })
  fromUserId: string;

  @Column({ type: "varchar", name: "from_user_name", nullable: true })
  fromUserName: string | null;

  @Column({ type: "varchar", name: "to_user_id" })
  toUserId: string;

  @Column({ type: "varchar", name: "game_id" })
  gameId: string;

  @Column({ type: "varchar", name: "game_title", nullable: true })
  gameTitle: string | null;

  @Column({ type: "text", nullable: true })
  message: string | null;

  @Column({ type: "varchar", default: "pending" })
  status: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @Column({ type: "timestamp", name: "responded_at", nullable: true })
  respondedAt: Date | null;
}
