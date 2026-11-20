import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Facebook live ingest needs the Page the host chose and that Page's own
 * access token; the user grant alone cannot create a Live Video.
 */
export class AddStreamingAccountPageColumns1786243200018
  implements MigrationInterface
{
  name = "AddStreamingAccountPageColumns1786243200018";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    await queryRunner.query(
      isMysql
        ? "ALTER TABLE streaming_accounts ADD COLUMN IF NOT EXISTS pageId varchar(64) NULL"
        : 'ALTER TABLE "streaming_accounts" ADD COLUMN IF NOT EXISTS "pageId" character varying(64)',
    );
    await queryRunner.query(
      isMysql
        ? "ALTER TABLE streaming_accounts ADD COLUMN IF NOT EXISTS pageToken text NULL"
        : 'ALTER TABLE "streaming_accounts" ADD COLUMN IF NOT EXISTS "pageToken" text',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    await queryRunner.query(
      isMysql
        ? "ALTER TABLE streaming_accounts DROP COLUMN IF EXISTS pageToken"
        : 'ALTER TABLE "streaming_accounts" DROP COLUMN IF EXISTS "pageToken"',
    );
    await queryRunner.query(
      isMysql
        ? "ALTER TABLE streaming_accounts DROP COLUMN IF EXISTS pageId"
        : 'ALTER TABLE "streaming_accounts" DROP COLUMN IF EXISTS "pageId"',
    );
  }
}
