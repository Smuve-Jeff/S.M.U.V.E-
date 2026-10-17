import {
  Entity,
  PrimaryColumn,
  CreateDateColumn,
} from "typeorm";

/**
 * Directional block record: `userId` blocked `blockedUserId`.
 * Enforcement is mutual — a block in either direction suppresses
 * user-to-user delivery (DMs, challenges, voice signals, invites).
 */
@Entity("user_blocks")
export class UserBlock {
  @PrimaryColumn({ type: "varchar", name: "user_id" })
  userId: string;

  @PrimaryColumn({ type: "varchar", name: "blocked_user_id" })
  blockedUserId: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
