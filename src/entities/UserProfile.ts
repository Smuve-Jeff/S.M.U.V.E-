import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * UserProfile entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("user_profiles")
export class UserProfile {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default UserProfile;
