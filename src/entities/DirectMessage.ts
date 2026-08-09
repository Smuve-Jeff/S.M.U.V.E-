import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * DirectMessage entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("direct_messages")
export class DirectMessage {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default DirectMessage;
