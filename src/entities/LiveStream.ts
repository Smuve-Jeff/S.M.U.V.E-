import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * One row per live-stream session a user runs. Used by:
 *   - the host's Go-Live button (issue / end on the server)
 *   - viewer tap-to-join paths (resolve by token from a share link)
 *
 * The row mirrors the JWT-popup contract: the row is created BEFORE the
 * OAuth popup opens so the share URL can be copied/embedded in the
 * popup's "you're going live" landing page.
 */
@Entity("live_streams")
@Index("live_streams_share_token_idx", ["shareToken"], { unique: true })
@Index("live_streams_host_idx", ["hostId"])
@Index("live_streams_active_idx", ["active"])
export class LiveStream {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Public URL-safe token embedded in the share link. Random 24 hex chars
   * (96 bits of entropy) — same generator used by GameInvite tokens.
   */
  @Column({ type: "varchar", name: "share_token", length: 64 })
  shareToken: string;

  @Column({ type: "varchar", name: "host_id" })
  hostId: string;

  @Column({ type: "varchar", name: "host_display_name", nullable: true })
  hostDisplayName: string | null;

  @Column({ type: "varchar", length: 32 })
  platform: string; // 'twitch' | 'kick' | 'youtube'

  @Column({ type: "varchar", name: "game_id", nullable: true })
  gameId: string | null;

  /**
   * When the stream is recorded alongside a co-op / split-screen lobby,
   * viewers opening the share link can be funneled into this lobby in
   * one tap via socket events. Null for solo broadcasts.
   */
  @Column({ type: "varchar", name: "lobby_id", nullable: true })
  lobbyId: string | null;

  /** Co-op / split-screen / challenge payload re-used by viewers on join. */
  @Column({ type: "jsonb", nullable: true })
  payload: Record<string, unknown> | null;

  /** Live flag flipped by the matching `end` call. */
  @Column({ type: "boolean", default: true })
  active: boolean;

  @CreateDateColumn({ name: "started_at" })
  startedAt: Date;

  @Column({ type: "timestamp", name: "ended_at", nullable: true })
  endedAt: Date | null;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  /** Counts every redeem against `shareToken`. Denormalized for telemetry. */
  @Column({ type: "integer", name: "viewer_joins", default: 0 })
  viewerJoins: number;
}
