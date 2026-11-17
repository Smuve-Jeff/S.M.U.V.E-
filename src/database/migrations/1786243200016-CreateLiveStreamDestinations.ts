import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates `live_stream_destinations`: one row per platform selected for a
 * live session. `live_streams` stays the session/share-token row, so existing
 * rows, tokens and viewer joins are untouched.
 *
 * Dialect-aware like the rest: PostgreSQL keeps quoted identifiers and the
 * foreign key; MySQL/Vitess uses bare identifiers and drops the FK.
 */
export class CreateLiveStreamDestinations1786243200016
  implements MigrationInterface
{
  name = "CreateLiveStreamDestinations1786243200016";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS live_stream_destinations (
          id int AUTO_INCREMENT PRIMARY KEY,
          live_stream_id int NOT NULL,
          platform varchar(16) NOT NULL,
          status varchar(16) NOT NULL DEFAULT 'pending',
          relay_id varchar(64),
          error varchar(300),
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_live_stream_destinations_stream_platform
          ON live_stream_destinations (live_stream_id, platform)
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS live_stream_destinations_status_idx
          ON live_stream_destinations (live_stream_id, status)
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS live_stream_destinations_relay_idx
          ON live_stream_destinations (relay_id)
      `);
      return;
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "live_stream_destinations" (
        "id" SERIAL PRIMARY KEY,
        "live_stream_id" integer NOT NULL,
        "platform" character varying(16) NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "relay_id" character varying(64),
        "error" character varying(300),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_live_stream_destinations_stream" FOREIGN KEY ("live_stream_id")
          REFERENCES "live_streams"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_live_stream_destinations_stream_platform"
        ON "live_stream_destinations" ("live_stream_id", "platform")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "live_stream_destinations_status_idx"
        ON "live_stream_destinations" ("live_stream_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "live_stream_destinations_relay_idx"
        ON "live_stream_destinations" ("relay_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      await queryRunner.query("DROP TABLE IF EXISTS live_stream_destinations");
      return;
    }
    await queryRunner.query(
      'DROP INDEX IF EXISTS "live_stream_destinations_relay_idx"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "live_stream_destinations_status_idx"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "uq_live_stream_destinations_stream_platform"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "live_stream_destinations"');
  }
}
