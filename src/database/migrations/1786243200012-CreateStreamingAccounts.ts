import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates `streaming_accounts` — the OAuth grant that lets a host broadcast.
 *
 * One row per (user, provider): connecting again replaces the grant instead of
 * accumulating dead ones, which is what the unique index enforces and what makes
 * "connect" an upsert. Both tokens are sealed by the application before they
 * reach this table (see `@/lib/secret-box`), so the columns hold ciphertext.
 *
 * `refreshToken` and `expiresAt` are nullable on purpose: providers may issue no
 * refresh token, and a token with no expiry has nothing to store.
 *
 * Dialect-aware: PostgreSQL keeps quoted identifiers and the FK; MySQL/Vitess
 * uses bare identifiers and drops the FK (Vitess does not support them).
 */
export class CreateStreamingAccounts1786243200012
  implements MigrationInterface
{
  name = "CreateStreamingAccounts1786243200012";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS streaming_accounts (
          id int AUTO_INCREMENT PRIMARY KEY,
          userId int NOT NULL,
          platform varchar(32) NOT NULL,
          providerAccountId varchar(128) NOT NULL,
          displayName varchar(128) NOT NULL,
          accessToken text NOT NULL,
          refreshToken text NULL,
          scopes varchar(512) NOT NULL DEFAULT '',
          expiresAt TIMESTAMP NULL DEFAULT NULL,
          connectedAt TIMESTAMP NOT NULL,
          lastSyncedAt TIMESTAMP NOT NULL
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_streaming_accounts_user_platform
          ON streaming_accounts (userId, platform)
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "streaming_accounts" (
          "id" SERIAL PRIMARY KEY,
          "userId" integer NOT NULL,
          "platform" character varying(32) NOT NULL,
          "providerAccountId" character varying(128) NOT NULL,
          "displayName" character varying(128) NOT NULL,
          "accessToken" text NOT NULL,
          "refreshToken" text NULL,
          "scopes" character varying(512) NOT NULL DEFAULT '',
          "expiresAt" TIMESTAMP NULL,
          "connectedAt" TIMESTAMP NOT NULL,
          "lastSyncedAt" TIMESTAMP NOT NULL,
          CONSTRAINT "FK_streaming_accounts_user" FOREIGN KEY ("userId")
            REFERENCES "users"("id") ON DELETE CASCADE
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "uq_streaming_accounts_user_platform"
          ON "streaming_accounts" ("userId", "platform")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      await queryRunner.query("DROP TABLE IF EXISTS streaming_accounts");
      return;
    }
    await queryRunner.query(
      'DROP INDEX IF EXISTS "uq_streaming_accounts_user_platform"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "streaming_accounts"');
  }
}
