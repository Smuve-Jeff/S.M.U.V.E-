import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the `room_messages` table backing persisted room chat.
 * Rooms are Tha Spot lobbies (room_id = lobby/party id). History is read
 * newest-first via (room_id, created_at) and capped by the app.
 *
 * Dialect-aware: PostgreSQL keeps `SERIAL`/quoted identifiers; MySQL/Vitess
 * (PlanetScale) uses `AUTO_INCREMENT`/bare identifiers.
 */
export class CreateRoomMessages1786243200006 implements MigrationInterface {
  name = "CreateRoomMessages1786243200006";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS room_messages (
          id int AUTO_INCREMENT PRIMARY KEY,
          room_id VARCHAR(128) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          user_name VARCHAR(255),
          message TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS room_messages_room_idx
          ON room_messages (room_id, created_at)
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "room_messages" (
          "id" SERIAL PRIMARY KEY,
          "room_id" VARCHAR(128) NOT NULL,
          "user_id" VARCHAR(255) NOT NULL,
          "user_name" VARCHAR(255),
          "message" TEXT NOT NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "room_messages_room_idx"
          ON "room_messages" ("room_id", "created_at")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";
    if (isMysql) {
      // DROP TABLE removes the indexes on MySQL/Vitess.
      await queryRunner.query(`DROP TABLE IF EXISTS room_messages`);
      return;
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "room_messages_room_idx"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "room_messages"`);
  }
}
