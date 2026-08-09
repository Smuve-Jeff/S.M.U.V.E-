import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * Friend entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("friends")
export class Friend {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default Friend;
