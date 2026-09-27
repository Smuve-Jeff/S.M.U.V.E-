import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/** What a grant is allowed to do. One live grant per (account, purpose). */
export type AccountTokenPurpose = "password_reset" | "email_verification";

/**
 * A single-use, time-boxed grant for one account action.
 *
 * Only the SHA-256 of the value that left the server is stored, so a database
 * leak cannot be replayed into an account takeover. `usedAt` makes a grant
 * one-shot even when the link or code is replayed from a mail archive,
 * `attempts` budgets guessing against the short email-verification code, and
 * deleting a user removes their outstanding grants (ON DELETE CASCADE).
 *
 * One row per (userId, purpose): issuing a new grant retires the previous one,
 * so an artist who taps "resend" never leaves an older live credential behind.
 */
@Entity("account_tokens")
@Index("uq_account_tokens_user_purpose", ["userId", "purpose"], { unique: true })
@Index("idx_account_tokens_hash", ["tokenHash"])
export class AccountToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "integer" })
  userId: number;

  @Column({ type: "varchar", length: 32 })
  purpose: AccountTokenPurpose;

  /** SHA-256 hex digest — never the token/code itself. Indexed for lookup. */
  @Column({ type: "varchar", length: 64 })
  tokenHash: string;

  @Column({ type: "timestamp" })
  expiresAt: Date;

  @Column({ type: "timestamp", nullable: true })
  usedAt: Date | null;

  /** Failed redemption attempts against this grant. */
  @Column({ type: "integer", default: 0 })
  attempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
