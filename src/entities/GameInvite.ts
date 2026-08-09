import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * A shareable invite token. The public game-entry link shape is
 * `${origin}/tha-spot?game=<gameId>&mode=<online|offline|co-op|split-screen|challenge|quick-match>&from=<optionalUserId>`.
 *
 * For sensitive flows (joining a private lobby, sending a challenge on
 * someone's behalf, queueing into a closed matchmaking bracket) we issue a
 * `token` here. The token is a short random URL-safe string the backend
 * signs/validates; resolution is one-shot for `private` invites.
 */
@Entity("game_invites")
@Index("game_invites_token_idx", ["token"], { unique: true })
@Index("game_invites_creator_idx", ["createdById"])
@Index("game_invites_target_idx", ["targetUserId"])
export class GameInvite {
  @PrimaryGeneratedColumn()
  id: number;

  /** Public unique token used in share URLs. Length-padded for collision safety. */
  @Column({ type: "varchar", length: 64 })
  token: string;

  @Column({ type: "varchar", name: "game_id" })
  gameId: string;

  /**
   * One of: `online` | `offline` | `co-op` | `split-screen` | `challenge` | `quick-match`.
   * Determines the deep-link handler the client picks when the URL is opened.
   */
  @Column({ type: "varchar", length: 32 })
  mode: string;

  @Column({ type: "varchar", name: "created_by_id" })
  createdById: string;

  /** When non-null, the invite is restricted to this recipient. */
  @Column({ type: "varchar", name: "target_user_id", nullable: true })
  targetUserId: string | null;

  /** Free-form metadata (lobbyId, message, level id). JSON-encoded. */
  @Column({ type: "jsonb", nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: "timestamp", name: "expires_at" })
  expiresAt: Date;

  @Column({ type: "timestamp", name: "consumed_at", nullable: true })
  consumedAt: Date | null;

  @Column({ type: "varchar", name: "consumed_by_id", nullable: true })
  consumedById: string | null;

  @Column({ type: "boolean", default: false })
  revoked: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
