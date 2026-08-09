import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * StudioSession entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("studio_sessions")
export class StudioSession {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default StudioSession;
