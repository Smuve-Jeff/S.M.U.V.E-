import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the `game_invites` table backing shareable-game-link invites.
 *
 * Columns mirror `GameInvite`:
 *   - token: unique public URL token
 *   - game_id, mode: deep-link target
 *   - created_by_id: owner (used for revoke/cleanup)
 *   - target_user_id: optional restricted recipient
 *   - payload: jsonb for lobby id, level, message, etc.
 *   - expires_at, consumed_at, consumed_by_id, revoked: lifecycle
 *
 * Dialect-aware: PostgreSQL keeps `SERIAL`/`JSONB`; MySQL/Vitess
 * (PlanetScale) uses `AUTO_INCREMENT`/`json` and skips descending-index
 * concerns. `IF NOT EXISTS` is supported by both.
 */
export class CreateGameInvites1786243200002 implements MigrationInterface {
  name = "CreateGameInvites1786243200002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS game_invites (
          id int AUTO_INCREMENT PRIMARY KEY,
          token VARCHAR(64) NOT NULL,
          game_id VARCHAR(255) NOT NULL,
          mode VARCHAR(32) NOT NULL,
          created_by_id VARCHAR(255) NOT NULL,
          target_user_id VARCHAR(255),
          payload json,
          expires_at TIMESTAMP NOT NULL,
          consumed_at TIMESTAMP,
          consumed_by_id VARCHAR(255),
          revoked BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT game_invites_token_unique UNIQUE (token)
        )
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS game_invites_creator_idx
          ON game_invites (created_by_id)
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS game_invites_target_idx
          ON game_invites (target_user_id)
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS game_invites_expires_idx
          ON game_invites (expires_at)
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "game_invites" (
          "id" SERIAL PRIMARY KEY,
          "token" VARCHAR(64) NOT NULL,
          "game_id" VARCHAR(255) NOT NULL,
          "mode" VARCHAR(32) NOT NULL,
          "created_by_id" VARCHAR(255) NOT NULL,
          "target_user_id" VARCHAR(255),
          "payload" jsonb,
          "expires_at" TIMESTAMP NOT NULL,
          "consumed_at" TIMESTAMP,
          "consumed_by_id" VARCHAR(255),
          "revoked" BOOLEAN NOT NULL DEFAULT FALSE,
          "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "game_invites_token_unique" UNIQUE ("token")
        )
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "game_invites_creator_idx"
          ON "game_invites" ("created_by_id")
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "game_invites_target_idx"
          ON "game_invites" ("target_user_id")
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "game_invites_expires_idx"
          ON "game_invites" ("expires_at")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      // DROP TABLE removes the indexes on MySQL/Vitess.
      await queryRunner.query(`DROP TABLE IF EXISTS game_invites`);
      return;
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "game_invites_expires_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "game_invites_target_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "game_invites_creator_idx"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "game_invites"`);
  }
}