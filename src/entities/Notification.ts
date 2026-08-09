import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * Notification entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default Notification;
