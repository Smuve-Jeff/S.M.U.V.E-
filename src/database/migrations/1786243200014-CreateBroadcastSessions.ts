import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates `broadcast_sessions`: one row per relay push, keyed by the relay's
 * session id. Recordings live on the relay's volume under that same id, so this
 * table is what lets the API answer "which of these files are mine?".
 *
 *   - `relay_id` UNIQUE: one row per relay session, and the join key for a
 *     recording file
 *   - `user_id`          (the host's recordings list)
 *
 * Dialect-aware like the rest: PostgreSQL keeps `SERIAL`/quoted identifiers,
 * MySQL/Vitess (PlanetScale) uses `AUTO_INCREMENT` and bare identifiers.
 */
export class CreateBroadcastSessions1786243200014 implements MigrationInterface {
  name = "CreateBroadcastSessions1786243200014";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS broadcast_sessions (
          id int AUTO_INCREMENT PRIMARY KEY,
          relay_id VARCHAR(64) NOT NULL,
          user_id INTEGER NOT NULL,
          platform VARCHAR(16) NOT NULL,
          started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ended_at TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_broadcast_sessions_relay UNIQUE (relay_id)
        )
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS broadcast_sessions_user_idx
          ON broadcast_sessions (user_id)
      `);
      return;
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broadcast_sessions" (
        "id" SERIAL PRIMARY KEY,
        "relay_id" VARCHAR(64) NOT NULL,
        "user_id" INTEGER NOT NULL,
        "platform" VARCHAR(16) NOT NULL,
        "started_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "ended_at" TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "uq_broadcast_sessions_relay" UNIQUE ("relay_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "broadcast_sessions_user_idx"
        ON "broadcast_sessions" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      await queryRunner.query(`DROP TABLE IF EXISTS broadcast_sessions`);
      return;
    }
    await queryRunner.query(
      `DROP INDEX IF EXISTS "broadcast_sessions_user_idx"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcast_sessions"`);
  }
}
