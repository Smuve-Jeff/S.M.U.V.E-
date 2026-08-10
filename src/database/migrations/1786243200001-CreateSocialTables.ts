import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSocialTables1786243200001 implements MigrationInterface {
  name = "CreateSocialTables1786243200001";

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "artist_identities"`);
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(`DROP TABLE "connector_jobs"`);
    await queryRunner.query(`DROP TABLE "remix_lineage"`);
    await queryRunner.query(`DROP TABLE "async_collaboration_packets"`);
    await queryRunner.query(`DROP TABLE "studio_approvals"`);
    await queryRunner.query(`DROP TABLE "studio_comments"`);
    await queryRunner.query(`DROP TABLE "studio_session_members"`);
    await queryRunner.query(`DROP TABLE "studio_sessions"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "game_challenges"`);
    await queryRunner.query(`DROP TABLE "direct_messages"`);
    await queryRunner.query(`DROP TABLE "friends"`);
    await queryRunner.query(`DROP TABLE "user_profiles"`);
  }
}
