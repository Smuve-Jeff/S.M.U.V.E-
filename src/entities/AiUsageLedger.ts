import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from "typeorm";

/**
 * Per-account AI media usage ledger: one row per user, counters reset on a
 * rolling 24-hour window (`windowStart` pins the current window). The
 * rate limiters bound bursts; this bounds the day — and, unlike an
 * in-memory counter, it survives restarts and is auditable afterwards.
 */
@Entity("ai_usage_ledger")
export class AiUsageLedger {
  @PrimaryColumn({ type: "int", name: "user_id" })
  userId: number;

  @Column({ type: "timestamptz", name: "window_start" })
  windowStart: Date;

  @Column({ type: "int", name: "image_count", default: 0 })
  imageCount: number;

  @Column({ type: "int", name: "video_count", default: 0 })
  videoCount: number;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
