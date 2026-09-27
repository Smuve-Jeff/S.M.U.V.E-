import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "varchar", length: 100, unique: true })
  email: string;

  @Column({ type: "varchar", select: false })
  password: string;

  @Column({ type: "varchar", length: 20, default: "user" })
  role: string;

  /**
   * Version of the credentials this account's tokens were minted against.
   *
   * Every JWT carries the value it was signed with; `authenticate` compares it
   * against this column, so incrementing it revokes every token issued before
   * now (password reset, password change). Stateless JWTs cannot be recalled
   * any other way.
   */
  @Column({ type: "integer", default: 0 })
  tokenVersion: number;

  /** Set only by the email-verification flow — never assumed from a login. */
  @Column({ type: "boolean", default: false })
  emailVerified: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
