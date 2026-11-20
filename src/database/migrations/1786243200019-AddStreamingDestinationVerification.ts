import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Durable "this exact RTMP URL + stream key passed a real destination test"
 * state. The fingerprint is an HMAC, never the key, and the application clears
 * both columns whenever either value changes.
 */
export class AddStreamingDestinationVerification1786243200019
  implements MigrationInterface
{
  name = "AddStreamingDestinationVerification1786243200019";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      await queryRunner.query(
        "ALTER TABLE streaming_destinations ADD COLUMN IF NOT EXISTS verifiedAt TIMESTAMP NULL",
      );
      await queryRunner.query(
        "ALTER TABLE streaming_destinations ADD COLUMN IF NOT EXISTS verifiedFingerprint varchar(64) NULL",
      );
      return;
    }
    await queryRunner.query(
      'ALTER TABLE "streaming_destinations" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP',
    );
    await queryRunner.query(
      'ALTER TABLE "streaming_destinations" ADD COLUMN IF NOT EXISTS "verifiedFingerprint" character varying(64)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      await queryRunner.query(
        "ALTER TABLE streaming_destinations DROP COLUMN IF EXISTS verifiedFingerprint",
      );
      await queryRunner.query(
        "ALTER TABLE streaming_destinations DROP COLUMN IF EXISTS verifiedAt",
      );
      return;
    }
    await queryRunner.query(
      'ALTER TABLE "streaming_destinations" DROP COLUMN IF EXISTS "verifiedFingerprint"',
    );
    await queryRunner.query(
      'ALTER TABLE "streaming_destinations" DROP COLUMN IF EXISTS "verifiedAt"',
    );
  }
}
