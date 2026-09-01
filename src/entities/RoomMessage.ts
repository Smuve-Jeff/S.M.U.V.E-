import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

/** Persisted room-chat message (Tha Spot lobby chat survives reloads). */
@Entity("room_messages")
export class RoomMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", name: "room_id" })
  roomId: string;

  @Column({ type: "varchar", name: "user_id" })
  userId: string;

  @Column({ type: "varchar", name: "user_name", nullable: true })
  userName: string | null;

  @Column({ type: "text" })
  message: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
