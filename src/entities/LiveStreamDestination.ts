import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type LiveDestinationStatus =
  | "pending"
  | "connecting"
  | "live"
  | "degraded"
  | "failed"
  | "ended";

/**
 * One platform selected for a live session.
 *
 * A `live_streams` row is the session and owns the share token; these rows are
 * the fan-out. Native S.M.U.V.E Live is one destination, each provider is
 * another, and the relay receives the provider subset as one WHIP session.
 */
@Entity("live_stream_destinations")
@Index(
  "uq_live_stream_destinations_stream_platform",
  ["streamId", "platform"],
  { unique: true },
)
@Index("live_stream_destinations_status_idx", ["streamId", "status"])
@Index("live_stream_destinations_relay_idx", ["relayId"])
export class LiveStreamDestination {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "integer", name: "live_stream_id" })
  streamId: number;

  @Column({ type: "varchar", length: 16 })
  platform: string;

  @Column({ type: "varchar", length: 16, default: "pending" })
  status: LiveDestinationStatus;

  /** The provider relay session shared by this destination's push. */
  @Column({ type: "varchar", name: "relay_id", length: 64, nullable: true })
  relayId: string | null;

  /** Last provider/relay error for this destination, never a stream key. */
  @Column({ type: "varchar", length: 300, nullable: true })
  error: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
