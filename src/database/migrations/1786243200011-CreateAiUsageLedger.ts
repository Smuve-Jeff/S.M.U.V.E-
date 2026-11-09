import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the `ai_usage_ledger` table backing the per-account AI media
 * quota (one row per user, counters reset on a rolling 24-hour window).
 */
export class CreateAiUsageLedger1786243200011 implements MigrationInterface {
  name = "CreateAiUsageLedger1786243200011";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_usage_ledger" (
        "user_id" INTEGER NOT NULL,
        "window_start" TIMESTAMPTZ NOT NULL,
        "image_count" INTEGER NOT NULL DEFAULT 0,
        "video_count" INTEGER NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_usage_ledger_user" PRIMARY KEY ("user_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_usage_ledger"`);
  }
}
