import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the two account columns the auth layer needs to stop trusting a bearer
 * token on its own:
 *
 *  - `tokenVersion` — every issued JWT carries the value it was signed with,
 *    and `authenticate` compares it against this column on each request. A
 *    credential rotation (password reset, password change) increments it, which
 *    is what makes "revoke every existing session" possible for stateless JWTs.
 *
 *  - `emailVerified` — set by the email-verification flow. Existing rows start
 *    unverified, which is the truthful state: nothing had ever confirmed them.
 *
 * Both are NOT NULL with defaults, so the ALTER is safe on populated tables.
 */
export class AddUserSessionAndVerificationColumns1786243200008
  implements MigrationInterface
{
  name = "AddUserSessionAndVerificationColumns1786243200008";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(
        `ALTER TABLE users ADD COLUMN tokenVersion int NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `ALTER TABLE users ADD COLUMN emailVerified boolean NOT NULL DEFAULT false`,
      );
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerified" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN emailVerified`);
      await queryRunner.query(`ALTER TABLE users DROP COLUMN tokenVersion`);
      return;
    }

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "emailVerified"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "tokenVersion"`);
  }
}
