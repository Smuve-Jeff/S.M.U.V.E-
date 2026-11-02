import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Versioned project history for the authenticated cloud. The table stores one
 * row per accepted push; ownership is always the server-side user id.
 */
export class CreateCloudProjectSnapshots1786243200009
  implements MigrationInterface
{
  name = 'CreateCloudProjectSnapshots1786243200009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === 'mysql';

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS cloud_project_snapshots (
          id int AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          project_id VARCHAR(200) NOT NULL,
          device_id VARCHAR(255) NOT NULL,
          device_name VARCHAR(255),
          version INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          data json NOT NULL,
          byte_size INT NOT NULL DEFAULT 0,
          snapshot_at BIGINT NOT NULL,
          CONSTRAINT cloud_project_snapshots_device_version_uq
            UNIQUE (user_id, project_id, device_id, version),
          INDEX cloud_project_snapshots_project_idx
            (user_id, project_id, snapshot_at)
        )
      `);
      return;
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cloud_project_snapshots" (
        "id" SERIAL PRIMARY KEY,
        "user_id" VARCHAR(255) NOT NULL,
        "project_id" VARCHAR(200) NOT NULL,
        "device_id" VARCHAR(255) NOT NULL,
        "device_name" VARCHAR(255),
        "version" INT NOT NULL,
        "title" VARCHAR(255) NOT NULL,
        "data" jsonb NOT NULL,
        "byte_size" INT NOT NULL DEFAULT 0,
        "snapshot_at" BIGINT NOT NULL,
        CONSTRAINT "cloud_project_snapshots_device_version_uq"
          UNIQUE ("user_id", "project_id", "device_id", "version")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "cloud_project_snapshots_project_idx"
        ON "cloud_project_snapshots" ("user_id", "project_id", "snapshot_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "cloud_project_snapshots"`,
    );
  }
}
