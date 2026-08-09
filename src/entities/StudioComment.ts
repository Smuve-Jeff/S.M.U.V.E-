import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * StudioComment entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("studio_comments")
export class StudioComment {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default StudioComment;
