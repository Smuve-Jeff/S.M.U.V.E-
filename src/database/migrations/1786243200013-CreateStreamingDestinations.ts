import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates `streaming_destinations` — the manual RTMP destination a platform
 * needs when its API does not expose the stream key (Kick).
 *
 * One row per (account, platform) so re-saving replaces the destination instead
 * of leaving dead keys behind, and the key itself is sealed by the application
 * before it ever reaches this table.
 *
 * Dialect-aware: PostgreSQL keeps quoted identifiers and the FK; MySQL/Vitess
 * uses bare identifiers and drops the FK (Vitess does not support them).
 */
export class CreateStreamingDestinations1786243200013
  implements MigrationInterface
{
  name = "CreateStreamingDestinations1786243200013";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS streaming_destinations (
          id int AUTO_INCREMENT PRIMARY KEY,
          userId int NOT NULL,
          platform varchar(16) NOT NULL,
          rtmpUrl varchar(512) NOT NULL,
          streamKey text NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_streaming_destinations_user_platform
          ON streaming_destinations (userId, platform)
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "streaming_destinations" (
          "id" SERIAL PRIMARY KEY,
          "userId" integer NOT NULL,
          "platform" character varying(16) NOT NULL,
          "rtmpUrl" character varying(512) NOT NULL,
          "streamKey" text NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "FK_streaming_destinations_user" FOREIGN KEY ("userId")
            REFERENCES "users"("id") ON DELETE CASCADE
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "uq_streaming_destinations_user_platform"
          ON "streaming_destinations" ("userId", "platform")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      await queryRunner.query("DROP TABLE IF EXISTS streaming_destinations");
      return;
    }
    await queryRunner.query(
      'DROP INDEX IF EXISTS "uq_streaming_destinations_user_platform"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "streaming_destinations"');
  }
}
