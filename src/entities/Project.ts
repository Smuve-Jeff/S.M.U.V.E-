import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * Project entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("projects")
export class Project {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default Project;
