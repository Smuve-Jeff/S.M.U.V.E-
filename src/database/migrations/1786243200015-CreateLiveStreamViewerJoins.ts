import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates `live_stream_viewer_joins`: the durable idempotence record for
 * viewer-join telemetry.
 *
 * The unique (stream_id, viewer_key) index is the invariant. A viewer can
 * refresh or reuse a share link at any time and still owns exactly one join
 * per broadcast. Keying on the stream row id (rather than the share token)
 * keeps the record scoped if tokens are ever rotated.
 *
 * Dialect-aware like the rest: PostgreSQL keeps `SERIAL`, quoted identifiers
 * and the cascade FK; MySQL/Vitess (PlanetScale) uses `AUTO_INCREMENT` and no
 * FK constraints.
 */
export class CreateLiveStreamViewerJoins1786243200015 implements MigrationInterface {
  name = "CreateLiveStreamViewerJoins1786243200015";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS live_stream_viewer_joins (
          id int AUTO_INCREMENT PRIMARY KEY,
          stream_id INTEGER NOT NULL,
          viewer_key VARCHAR(255) NOT NULL,
          joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_live_stream_viewer_join
          ON live_stream_viewer_joins (stream_id, viewer_key)
      `);
      return;
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "live_stream_viewer_joins" (
        "id" SERIAL PRIMARY KEY,
        "stream_id" INTEGER NOT NULL,
        "viewer_key" VARCHAR(255) NOT NULL,
        "joined_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fk_live_stream_viewer_join_stream"
          FOREIGN KEY ("stream_id") REFERENCES "live_streams"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_live_stream_viewer_join"
        ON "live_stream_viewer_joins" ("stream_id", "viewer_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      await queryRunner.query(`DROP TABLE IF EXISTS live_stream_viewer_joins`);
      return;
    }
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_live_stream_viewer_join"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "live_stream_viewer_joins"`);
  }
}
