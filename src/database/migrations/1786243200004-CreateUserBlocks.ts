import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the `user_blocks` table backing the player blocklist.
 * Directional rows: (user_id -> blocked_user_id). Lookups are mutual:
 * a block in EITHER direction suppresses user-to-user delivery, so we
 * index both columns.
 *
 * Dialect-aware: PostgreSQL keeps quoted identifiers; MySQL/Vitess
 * (PlanetScale) uses bare identifiers.
 */
export class CreateUserBlocks1786243200004 implements MigrationInterface {
  name = "CreateUserBlocks1786243200004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS user_blocks (
          user_id VARCHAR(255) NOT NULL,
          blocked_user_id VARCHAR(255) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, blocked_user_id)
        )
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx
          ON user_blocks (blocked_user_id)
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "user_blocks" (
          "user_id" VARCHAR(255) NOT NULL,
          "blocked_user_id" VARCHAR(255) NOT NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY ("user_id", "blocked_user_id")
        )
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "user_blocks_blocked_idx"
          ON "user_blocks" ("blocked_user_id")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      // DROP TABLE removes the indexes on MySQL/Vitess.
      await queryRunner.query(`DROP TABLE IF EXISTS user_blocks`);
      return;
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "user_blocks_blocked_idx"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_blocks"`);
  }
}
