import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * ConnectorJob entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("connector_jobs")
export class ConnectorJob {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default ConnectorJob;
