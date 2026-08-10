import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("async_collaboration_packets")
export class AsyncCollaborationPacket {
  @PrimaryColumn({ type: "varchar" })
  id: string;

  @Column({ type: "varchar", name: "session_id" })
  sessionId: string;

  @Column({ type: "varchar", name: "from_user_id" })
  fromUserId: string;

  @Column({ type: "varchar", name: "to_user_id" })
  toUserId: string;

  @Column({ type: "varchar", name: "packet_type" })
  packetType: string;

  @Column({ type: "varchar", default: "pending" })
  status: string;

  @Column({ type: "jsonb", default: {} })
  payload: Record<string, unknown>;

  @Column({ type: "jsonb", name: "response_payload", nullable: true })
  responsePayload: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @Column({ type: "timestamp", name: "applied_at", nullable: true })
  appliedAt: Date | null;
}
