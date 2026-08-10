import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("artist_identities")
export class ArtistIdentity {
  @PrimaryColumn({ type: "varchar", name: "user_id" })
  userId: string;

  @Column({ type: "jsonb", default: {} })
  identity: Record<string, unknown>;

  @Column({ type: "jsonb", name: "profile_data", nullable: true })
  profileData: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
