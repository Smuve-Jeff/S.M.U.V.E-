import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * One row per broadcast push the relay runs for a host.
 *
 * The relay records each push to `<relayId>.mp4` on its own volume, so the
 * relay id is the only handle that ties a recording to the person who made it.
 * Without this row a recordings list would either be empty or hand every host
 * the whole relay's output.
 */
@Entity("broadcast_sessions")
@Index("uq_broadcast_sessions_relay", ["relayId"], { unique: true })
@Index("broadcast_sessions_user_idx", ["userId"])
export class BroadcastSession {
  @PrimaryGeneratedColumn()
  id: number;

  /** The relay's session id, which is also the recording's file name. */
  @Column({ type: "varchar", name: "relay_id", length: 64 })
  relayId: string;

  @Column({ type: "integer", name: "user_id" })
  userId: number;

  @Column({ type: "varchar", length: 16 })
  platform: string;

  @CreateDateColumn({ name: "started_at" })
  startedAt: Date;

  /** Set when the host (or the app) closes the push. */
  @Column({ type: "timestamp", name: "ended_at", nullable: true })
  endedAt: Date | null;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
