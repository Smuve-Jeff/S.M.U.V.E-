import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** Platforms this app can push a broadcast to. */
export type IngestPlatform = "twitch" | "kick";

/**
 * A manual RTMP destination for a provider whose API cannot hand us the key.
 *
 * Twitch keys are read live from Helix, so Twitch never needs a row here. Kick
 * only publishes its stream URL and key in the creator dashboard, so the host
 * pastes them once and the key is sealed (see `@/lib/secret-box`) like every
 * other credential this app stores.
 */
@Entity("streaming_destinations")
@Index("uq_streaming_destinations_user_platform", ["userId", "platform"], {
  unique: true,
})
export class StreamingDestination {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "integer" })
  userId: number;

  @Column({ type: "varchar", length: 16 })
  platform: IngestPlatform;

  /** Ingest URL from the provider dashboard, e.g. `rtmps://…:443/app`. */
  @Column({ type: "varchar", length: 512 })
  rtmpUrl: string;

  /** Sealed stream key — never stored or returned in the clear. */
  @Column({ type: "text" })
  streamKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
