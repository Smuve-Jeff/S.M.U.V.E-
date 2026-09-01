import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Hard database guard for challenge dedupe: at most ONE pending challenge
 * may exist between a given (from, to) pair for a given game.
 *
 * PostgreSQL: partial unique index — only rows with status = 'pending'
 * participate, so resolved/expired challenges never collide.
 *
 * MySQL/Vitess: no partial-index support, so we add a generated column
 * that is NULL unless the row is pending (NULLs are exempt from unique
 * constraints) and index that.
 */
export class CreateChallengeDedupeIndex1786243200005
  implements MigrationInterface
{
  name = "CreateChallengeDedupeIndex1786243200005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        ALTER TABLE game_challenges
          ADD COLUMN IF NOT EXISTS pending_key VARCHAR(768)
          GENERATED ALWAYS AS (
            CASE WHEN status = 'pending'
              THEN CONCAT(from_user_id, ':', to_user_id, ':', game_id)
              ELSE NULL
            END
          ) STORED
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_game_challenges_pending
          ON game_challenges (pending_key)
      `);
    } else {
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "uq_game_challenges_pending"
          ON "game_challenges" ("from_user_id", "to_user_id", "game_id")
          WHERE "status" = 'pending'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      await queryRunner.query(
        `DROP INDEX IF EXISTS uq_game_challenges_pending ON game_challenges`,
      );
      await queryRunner.query(
        `ALTER TABLE game_challenges DROP COLUMN IF EXISTS pending_key`,
      );
      return;
    }
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_game_challenges_pending"`,
    );
  }
}
