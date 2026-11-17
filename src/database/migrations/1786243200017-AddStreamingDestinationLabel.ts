import type { MigrationInterface, QueryRunner } from "typeorm";

/** Names a generic custom RTMP target (TikTok, Instagram, X, LinkedIn, …). */
export class AddStreamingDestinationLabel1786243200017
  implements MigrationInterface
{
  name = "AddStreamingDestinationLabel1786243200017";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    await queryRunner.query(
      isMysql
        ? "ALTER TABLE streaming_destinations ADD COLUMN IF NOT EXISTS label varchar(40) NULL"
        : 'ALTER TABLE "streaming_destinations" ADD COLUMN IF NOT EXISTS "label" character varying(40)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    await queryRunner.query(
      isMysql
        ? "ALTER TABLE streaming_destinations DROP COLUMN IF EXISTS label"
        : 'ALTER TABLE "streaming_destinations" DROP COLUMN IF EXISTS "label"',
    );
  }
}
