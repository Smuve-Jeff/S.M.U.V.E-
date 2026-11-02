import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One immutable project version in an artist's cloud history.
 *
 * `userId` is always taken from the authenticated request, never the body, so
 * a forged payload cannot write into another account's history. The unique
 * index prevents the same device/version pair from being stored twice when a
 * client retries an uncertain push.
 */
@Entity('cloud_project_snapshots')
@Index(
  'cloud_project_snapshots_device_version_uq',
  ['userId', 'projectId', 'deviceId', 'version'],
  { unique: true },
)
@Index('cloud_project_snapshots_project_idx', ['userId', 'projectId', 'timestamp'])
export class CloudProjectSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', name: 'project_id' })
  projectId: string;

  @Column({ type: 'varchar', name: 'device_id' })
  deviceId: string;

  @Column({ type: 'varchar', name: 'device_name', nullable: true })
  deviceName: string | null;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'jsonb' })
  data: unknown;

  @Column({ type: 'int', name: 'byte_size', default: 0 })
  byteSize: number;

  @Column({
    type: 'bigint',
    name: 'snapshot_at',
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value),
    },
  })
  timestamp: number;
}
