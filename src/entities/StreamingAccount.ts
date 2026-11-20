import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from "typeorm";

/** Providers with a real OAuth implementation on the server. */
export type StreamingProvider = "twitch" | "youtube" | "kick" | "facebook";

/**
 * One linked streaming account per (user, provider).
 *
 * Tokens are the crown jewels here: both live AES-256-GCM sealed (see
 * `@/lib/secret-box`), never in plain text and never returned by an endpoint.
 * The unique (userId, platform) index is what makes "connect" an upsert — a
 * host who reconnects replaces the grant instead of accumulating dead ones —
 * and deleting a user removes their grants (ON DELETE CASCADE).
 */
@Entity("streaming_accounts")
@Index("uq_streaming_accounts_user_platform", ["userId", "platform"], {
  unique: true,
})
export class StreamingAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "integer" })
  userId: number;

  @Column({ type: "varchar", length: 32 })
  platform: StreamingProvider;

  /** Provider-side account id (Twitch user id / Google `sub`). */
  @Column({ type: "varchar", length: 128 })
  providerAccountId: string;

  /** Channel name shown in the host's accounts list. */
  @Column({ type: "varchar", length: 128 })
  displayName: string;

  /** Sealed access token — the plain value never touches the database. */
  @Column({ type: "text" })
  accessToken: string;

  /** Sealed refresh token, when the provider issued one. */
  @Column({ type: "text", nullable: true })
  refreshToken: string | null;

  /**
   * Facebook only: the Page that will receive the live video. Null until the
   * host links an account that manages a Page.
   */
  @Column({ type: "varchar", length: 64, nullable: true })
  pageId: string | null;

  /** Sealed Page access token used to create and end Live Videos. */
  @Column({ type: "text", nullable: true })
  pageToken: string | null;

  @Column({ type: "varchar", length: 512, default: "" })
  scopes: string;

  @Column({ type: "timestamp", nullable: true })
  expiresAt: Date | null;

  @Column({ type: "timestamp" })
  connectedAt: Date;

  /** Last time Sync confirmed (or refreshed) this grant. */
  @Column({ type: "timestamp" })
  lastSyncedAt: Date;
}
