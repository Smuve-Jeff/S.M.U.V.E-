import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("direct_messages")
export class DirectMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", name: "from_user_id" })
  fromUserId: string;

  @Column({ type: "varchar", name: "to_user_id" })
  toUserId: string;

  @Column({ type: "text" })
  message: string;

  @CreateDateColumn()
  timestamp: Date;
}
