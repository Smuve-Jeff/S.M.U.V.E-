import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * One row per viewer per broadcast. The unique (stream_id, viewer_key) index
 * is the durable idempotence guard for viewer-join telemetry: a viewer who
 * refreshes, taps JOIN twice, or returns later to the same stream can redeem
 * the share token repeatedly without inflating `live_streams.viewer_joins`.
 *
 * `viewer_key` is the normalized key shared by the REST and socket redeem
 * paths (`user:<id>` or `guest:<browser-id>`). It lives here instead of an
 * in-memory window so a later refresh, another API process, or a restart
 * cannot count the same viewer again.
 */
@Entity("live_stream_viewer_joins")
@Index("uq_live_stream_viewer_join", ["streamId", "viewerKey"], {
  unique: true,
})
export class LiveStreamViewerJoin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "integer", name: "stream_id" })
  streamId: number;

  @Column({ type: "varchar", name: "viewer_key", length: 255 })
  viewerKey: string;

  @CreateDateColumn({ name: "joined_at" })
  joinedAt: Date;
}
