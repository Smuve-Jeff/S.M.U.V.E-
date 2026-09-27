import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates `account_tokens` — the backing store for account recovery and email
 * verification.
 *
 * One row per (account, purpose): the purpose discriminator is what lets a
 * single table back both flows instead of two near-identical ones. The unique
 * (userId, purpose) index enforces "one live grant per action", so issuing a
 * new link/code retires the previous one, and `tokenHash` is indexed for the
 * unauthenticated lookup (the reset link carries only the token, no session).
 *
 * Dialect-aware: PostgreSQL keeps `SERIAL`/quoted identifiers and the FK;
 * MySQL/Vitess (PlanetScale) uses `AUTO_INCREMENT`/bare identifiers and drops
 * foreign keys (Vitess does not support FK constraints).
 */
export class CreateAccountTokens1786243200007 implements MigrationInterface {
  name = "CreateAccountTokens1786243200007";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS account_tokens (
          id int AUTO_INCREMENT PRIMARY KEY,
          userId int NOT NULL,
          purpose varchar(32) NOT NULL,
          tokenHash varchar(64) NOT NULL,
          expiresAt TIMESTAMP NOT NULL,
          usedAt TIMESTAMP NULL,
          attempts int NOT NULL DEFAULT 0,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_account_tokens_user_purpose
          ON account_tokens (userId, purpose)
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_account_tokens_hash
          ON account_tokens (tokenHash)
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "account_tokens" (
          "id" SERIAL PRIMARY KEY,
          "userId" integer NOT NULL,
          "purpose" character varying(32) NOT NULL,
          "tokenHash" character varying(64) NOT NULL,
          "expiresAt" TIMESTAMP NOT NULL,
          "usedAt" TIMESTAMP NULL,
          "attempts" integer NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "FK_account_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "uq_account_tokens_user_purpose"
          ON "account_tokens" ("userId", "purpose")
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_account_tokens_hash"
          ON "account_tokens" ("tokenHash")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      // DROP TABLE removes the indexes on MySQL/Vitess.
      await queryRunner.query(`DROP TABLE IF EXISTS account_tokens`);
      return;
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_account_tokens_user_purpose"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_account_tokens_hash"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account_tokens"`);
  }
}
