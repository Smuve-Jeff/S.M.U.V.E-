import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the social / collaboration tables.
 *
 * Dialect-aware: PostgreSQL (Render/local) keeps `jsonb`, `SERIAL`,
 * `text[]` and descending indexes; MySQL/Vitess (PlanetScale) uses `json`,
 * `AUTO_INCREMENT` and ascending indexes. Vitess does not support foreign
 * keys or descending indexes, so both are omitted on the MySQL branch.
 */
export class CreateSocialTables1786243200001 implements MigrationInterface {
  name = "CreateSocialTables1786243200001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE user_profiles (
          user_id varchar(255) PRIMARY KEY,
          profile_data json NOT NULL DEFAULT (JSON_OBJECT()),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE friends (
          user_id varchar(255) NOT NULL,
          friend_id varchar(255) NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, friend_id)
        )
      `);

      await queryRunner.query(`
        CREATE TABLE direct_messages (
          id int AUTO_INCREMENT PRIMARY KEY,
          from_user_id varchar(255) NOT NULL,
          to_user_id varchar(255) NOT NULL,
          message text NOT NULL,
          timestamp TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE game_challenges (
          id int AUTO_INCREMENT PRIMARY KEY,
          from_user_id varchar(255) NOT NULL,
          from_user_name varchar(255),
          to_user_id varchar(255) NOT NULL,
          game_id varchar(255) NOT NULL,
          game_title varchar(255),
          message text,
          status varchar(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now(),
          responded_at TIMESTAMP
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IDX_challenges_to_status ON game_challenges (to_user_id, status)`,
      );
      await queryRunner.query(
        `CREATE INDEX IDX_challenges_to_created ON game_challenges (to_user_id, created_at)`,
      );

      await queryRunner.query(`
        CREATE TABLE notifications (
          id int AUTO_INCREMENT PRIMARY KEY,
          user_id varchar(255) NOT NULL,
          type varchar(50) NOT NULL,
          title varchar(255) NOT NULL,
          body text NOT NULL,
          payload json NOT NULL DEFAULT (JSON_OBJECT()),
          is_read boolean NOT NULL DEFAULT false,
          created_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IDX_notif_user_unread ON notifications (user_id, is_read, created_at)`,
      );

      await queryRunner.query(`
        CREATE TABLE studio_sessions (
          id varchar(255) PRIMARY KEY,
          project_id varchar(255),
          created_by_id varchar(255) NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'active',
          metadata json NOT NULL DEFAULT (JSON_OBJECT()),
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE studio_session_members (
          id int AUTO_INCREMENT PRIMARY KEY,
          session_id varchar(255) NOT NULL,
          user_id varchar(255) NOT NULL,
          role varchar(50) NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'active',
          permissions json NOT NULL DEFAULT (JSON_OBJECT()),
          joined_at TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT UQ_studio_member_session_user UNIQUE (session_id, user_id)
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IDX_studio_members_session ON studio_session_members (session_id, status)`,
      );

      await queryRunner.query(`
        CREATE TABLE studio_comments (
          id varchar(255) PRIMARY KEY,
          session_id varchar(255) NOT NULL,
          project_id varchar(255) NOT NULL,
          branch_id varchar(255),
          checkpoint_id varchar(255),
          track_id varchar(255),
          clip_id varchar(255),
          user_id varchar(255) NOT NULL,
          content text NOT NULL,
          resolved boolean NOT NULL DEFAULT false,
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE studio_approvals (
          id varchar(255) PRIMARY KEY,
          session_id varchar(255) NOT NULL,
          project_id varchar(255) NOT NULL,
          branch_id varchar(255),
          checkpoint_id varchar(255),
          created_by_id varchar(255) NOT NULL,
          approver_ids json NOT NULL DEFAULT (JSON_ARRAY()),
          approval_status json NOT NULL DEFAULT (JSON_OBJECT()),
          overall_status varchar(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE async_collaboration_packets (
          id varchar(255) PRIMARY KEY,
          session_id varchar(255) NOT NULL,
          from_user_id varchar(255) NOT NULL,
          to_user_id varchar(255) NOT NULL,
          packet_type varchar(100) NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'pending',
          payload json NOT NULL DEFAULT (JSON_OBJECT()),
          response_payload json,
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          applied_at TIMESTAMP
        )
      `);

      await queryRunner.query(`
        CREATE TABLE remix_lineage (
          id varchar(255) PRIMARY KEY,
          remix_project_id varchar(255) NOT NULL UNIQUE,
          source_project_id varchar(255),
          remixer_id varchar(255) NOT NULL,
          lineage json NOT NULL DEFAULT (JSON_ARRAY()),
          depth integer NOT NULL DEFAULT 1,
          attribution json NOT NULL DEFAULT (JSON_OBJECT()),
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          accepted_at TIMESTAMP
        )
      `);

      await queryRunner.query(`
        CREATE TABLE connector_jobs (
          id varchar(255) PRIMARY KEY,
          user_id varchar(255) NOT NULL,
          job json NOT NULL DEFAULT (JSON_OBJECT()),
          status varchar(20) NOT NULL DEFAULT 'queued',
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE projects (
          project_id varchar(255) PRIMARY KEY,
          user_id varchar(255) NOT NULL,
          title varchar(255) NOT NULL,
          project_data json NOT NULL DEFAULT (JSON_OBJECT()),
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IDX_projects_user ON projects (user_id, updated_at)`,
      );

      await queryRunner.query(`
        CREATE TABLE artist_identities (
          user_id varchar(255) PRIMARY KEY,
          identity json NOT NULL DEFAULT (JSON_OBJECT()),
          profile_data json,
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE "user_profiles" (
          "user_id" character varying PRIMARY KEY,
          "profile_data" jsonb NOT NULL DEFAULT '{}',
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "friends" (
          "user_id" character varying NOT NULL,
          "friend_id" character varying NOT NULL,
          "status" character varying NOT NULL DEFAULT 'pending',
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          PRIMARY KEY ("user_id", "friend_id")
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "direct_messages" (
          "id" SERIAL PRIMARY KEY,
          "from_user_id" character varying NOT NULL,
          "to_user_id" character varying NOT NULL,
          "message" text NOT NULL,
          "timestamp" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "game_challenges" (
          "id" SERIAL PRIMARY KEY,
          "from_user_id" character varying NOT NULL,
          "from_user_name" character varying,
          "to_user_id" character varying NOT NULL,
          "game_id" character varying NOT NULL,
          "game_title" character varying,
          "message" text,
          "status" character varying NOT NULL DEFAULT 'pending',
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "responded_at" TIMESTAMP
        )
      `);
      await queryRunner.query(
        `CREATE INDEX "IDX_challenges_to_status" ON "game_challenges" ("to_user_id", "status")`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_challenges_to_created" ON "game_challenges" ("to_user_id", "created_at" DESC)`,
      );

      await queryRunner.query(`
        CREATE TABLE "notifications" (
          "id" SERIAL PRIMARY KEY,
          "user_id" character varying NOT NULL,
          "type" character varying NOT NULL,
          "title" character varying NOT NULL,
          "body" text NOT NULL,
          "payload" jsonb NOT NULL DEFAULT '{}',
          "is_read" boolean NOT NULL DEFAULT false,
          "created_at" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      await queryRunner.query(
        `CREATE INDEX "IDX_notif_user_unread" ON "notifications" ("user_id", "is_read", "created_at" DESC)`,
      );

      await queryRunner.query(`
        CREATE TABLE "studio_sessions" (
          "id" character varying PRIMARY KEY,
          "project_id" character varying,
          "created_by_id" character varying NOT NULL,
          "status" character varying NOT NULL DEFAULT 'active',
          "metadata" jsonb NOT NULL DEFAULT '{}',
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "studio_session_members" (
          "id" SERIAL PRIMARY KEY,
          "session_id" character varying NOT NULL,
          "user_id" character varying NOT NULL,
          "role" character varying NOT NULL,
          "status" character varying NOT NULL DEFAULT 'active',
          "permissions" jsonb NOT NULL DEFAULT '{}',
          "joined_at" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_studio_member_session_user" UNIQUE ("session_id", "user_id")
        )
      `);
      await queryRunner.query(
        `CREATE INDEX "IDX_studio_members_session" ON "studio_session_members" ("session_id", "status")`,
      );

      await queryRunner.query(`
        CREATE TABLE "studio_comments" (
          "id" character varying PRIMARY KEY,
          "session_id" character varying NOT NULL,
          "project_id" character varying NOT NULL,
          "branch_id" character varying,
          "checkpoint_id" character varying,
          "track_id" character varying,
          "clip_id" character varying,
          "user_id" character varying NOT NULL,
          "content" text NOT NULL,
          "resolved" boolean NOT NULL DEFAULT false,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "studio_approvals" (
          "id" character varying PRIMARY KEY,
          "session_id" character varying NOT NULL,
          "project_id" character varying NOT NULL,
          "branch_id" character varying,
          "checkpoint_id" character varying,
          "created_by_id" character varying NOT NULL,
          "approver_ids" text[] NOT NULL DEFAULT '{}',
          "approval_status" jsonb NOT NULL DEFAULT '{}',
          "overall_status" character varying NOT NULL DEFAULT 'pending',
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "async_collaboration_packets" (
          "id" character varying PRIMARY KEY,
          "session_id" character varying NOT NULL,
          "from_user_id" character varying NOT NULL,
          "to_user_id" character varying NOT NULL,
          "packet_type" character varying NOT NULL,
          "status" character varying NOT NULL DEFAULT 'pending',
          "payload" jsonb NOT NULL DEFAULT '{}',
          "response_payload" jsonb,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "applied_at" TIMESTAMP
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "remix_lineage" (
          "id" character varying PRIMARY KEY,
          "remix_project_id" character varying NOT NULL UNIQUE,
          "source_project_id" character varying,
          "remixer_id" character varying NOT NULL,
          "lineage" jsonb NOT NULL DEFAULT '[]',
          "depth" integer NOT NULL DEFAULT 1,
          "attribution" jsonb NOT NULL DEFAULT '{}',
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "accepted_at" TIMESTAMP
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "connector_jobs" (
          "id" character varying PRIMARY KEY,
          "user_id" character varying NOT NULL,
          "job" jsonb NOT NULL DEFAULT '{}',
          "status" character varying NOT NULL DEFAULT 'queued',
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "projects" (
          "project_id" character varying PRIMARY KEY,
          "user_id" character varying NOT NULL,
          "title" character varying NOT NULL,
          "project_data" jsonb NOT NULL DEFAULT '{}',
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      await queryRunner.query(
        `CREATE INDEX "IDX_projects_user" ON "projects" ("user_id", "updated_at" DESC)`,
      );

      await queryRunner.query(`
        CREATE TABLE "artist_identities" (
          "user_id" character varying PRIMARY KEY,
          "identity" jsonb NOT NULL DEFAULT '{}',
          "profile_data" jsonb,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      "artist_identities",
      "projects",
      "connector_jobs",
      "remix_lineage",
      "async_collaboration_packets",
      "studio_approvals",
      "studio_comments",
      "studio_session_members",
      "studio_sessions",
      "notifications",
      "game_challenges",
      "direct_messages",
      "friends",
      "user_profiles",
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}