import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * AsyncCollaborationPacket entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("async_collaboration_packets")
export class AsyncCollaborationPacket {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default AsyncCollaborationPacket;
