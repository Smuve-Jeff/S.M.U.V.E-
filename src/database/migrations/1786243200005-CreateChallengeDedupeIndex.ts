import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Hard database guard for challenge dedupe: at most ONE pending challenge
 * may exist between a given (from, to) pair for a given game.
 *
 * Production already contains duplicate pending rows (they were possible
 * before this guard existed), so `up()` first expires every duplicate
 * pending challenge, keeping only the newest row per (from, to, game).
 * Only then can the unique index be created.
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
      // Expire all but the newest pending challenge per (from, to, game).
      await queryRunner.query(`
        UPDATE game_challenges c
          JOIN game_challenges newer
            ON newer.from_user_id = c.from_user_id
           AND newer.to_user_id = c.to_user_id
           AND newer.game_id = c.game_id
           AND newer.status = 'pending'
           AND (newer.created_at > c.created_at
                OR (newer.created_at = c.created_at AND newer.id > c.id))
          SET c.status = 'expired'
          WHERE c.status = 'pending'
      `);
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
      // Expire all but the newest pending challenge per (from, to, game).
      await queryRunner.query(`
        UPDATE game_challenges c
          SET status = 'expired'
          WHERE c.status = 'pending'
            AND EXISTS (
              SELECT 1 FROM game_challenges newer
              WHERE newer.from_user_id = c.from_user_id
                AND newer.to_user_id = c.to_user_id
                AND newer.game_id = c.game_id
                AND newer.status = 'pending'
                AND (newer.created_at > c.created_at
                     OR (newer.created_at = c.created_at AND newer.id > c.id))
            )
      `);
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
