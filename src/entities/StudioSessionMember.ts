import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * StudioSessionMember entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("studio_session_members")
export class StudioSessionMember {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default StudioSessionMember;
