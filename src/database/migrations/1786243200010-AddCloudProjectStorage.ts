import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Move large project snapshots out of Postgres JSONB and into private object
 * storage. `data` stays nullable for old/new inline snapshots, while
 * `storage_key` points at the R2 object written by a resumable upload.
 */
export class AddCloudProjectStorage1786243200010 implements MigrationInterface {
  name = "AddCloudProjectStorage1786243200010";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cloud_project_snapshots" ADD COLUMN IF NOT EXISTS "storage_key" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "cloud_project_snapshots" ALTER COLUMN "data" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "cloud_project_snapshots" SET "data" = 'null'::jsonb WHERE "data" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "cloud_project_snapshots" ALTER COLUMN "data" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "cloud_project_snapshots" DROP COLUMN IF EXISTS "storage_key"`,
    );
  }
}
