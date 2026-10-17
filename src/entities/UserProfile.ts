import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from "typeorm";

@Entity("user_profiles")
export class UserProfile {
  @PrimaryColumn({ type: "varchar", name: "user_id" })
  userId: string;

  @Column({ type: "jsonb", name: "profile_data" })
  profileData: Record<string, unknown>;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
