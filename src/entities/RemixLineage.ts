import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * RemixLineage entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("remix_lineage")
export class RemixLineage {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default RemixLineage;
