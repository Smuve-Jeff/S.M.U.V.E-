import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * ArtistIdentity entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("artist_identities")
export class ArtistIdentity {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default ArtistIdentity;
