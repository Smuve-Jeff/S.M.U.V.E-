import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the `live_streams` table backing the per-cabinet Go-Live button.
 * Mirrors `LiveStream` with an explicit index plan:
 *   - `shareToken` UNIQUE  (viewer join path)
 *   - `hostId`             (host dashboard: list my recent streams)
 *   - `active`             (cleanup + "is this person live" lookups)
 */
export class CreateLiveStreams1786243200003 implements MigrationInterface {
  name = "CreateLiveStreams1786243200003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "live_streams" (
        "id" SERIAL PRIMARY KEY,
        "share_token" VARCHAR(64) NOT NULL,
        "host_id" VARCHAR(255) NOT NULL,
        "host_display_name" VARCHAR(255),
        "platform" VARCHAR(32) NOT NULL,
        "game_id" VARCHAR(255),
        "lobby_id" VARCHAR(255),
        "payload" JSONB,
        "active" BOOLEAN NOT NULL DEFAULT TRUE,
        "started_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "ended_at" TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "viewer_joins" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "live_streams_share_token_unique" UNIQUE ("share_token")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "live_streams_host_idx"
        ON "live_streams" ("host_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "live_streams_active_idx"
        ON "live_streams" ("active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "live_streams_active_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "live_streams_host_idx"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "live_streams"`);
  }
}
