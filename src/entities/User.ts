import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * User entity stub.
 *
 * The real schema lives in server/index.js (legacy) and must be ported
 * over column-by-column. For now we declare just the primary key so
 * `src/database/data-source.ts` can register an entity class without
 * crashing tsc. All create/read queries continue to work against the
 * server/index.js-managed `users` table.
 */
@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default User;
