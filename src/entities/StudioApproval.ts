import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * StudioApproval entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("studio_approvals")
export class StudioApproval {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default StudioApproval;
