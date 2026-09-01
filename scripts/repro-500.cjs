/* eslint-disable no-console */
/**
 * Query-builder verification harness (pg-mem).
 *
 * Reproduces the production 500s from the social/socket services:
 *   - PUT /api/users/:id/blocks/:id     → blockUser insert (column-name
 *     values were silently emitted as DEFAULT → NOT NULL violation)
 *   - GET  /api/users/:id/challenges    → expireStaleChallenges update
 *     (TypeORM throws: Property "updated_at" was not found)
 * ...and verifies the FIXED entity-property-key chains generate valid SQL.
 *
 * Uses EntitySchema mirrors of the real entities — same metadata shape that
 * drives TypeORM 1.x's insert/update validation on the live server.
 *
 * Run (from repo root):
 *   npm i --no-save pg-mem        # dev-only, not a committed dependency
 *   node scripts/repro-500.cjs
 * (also wired as `npm run qa:sql`)
 */
"use strict";

const { newDb, DataType } = require("pg-mem");
const { DataSource, EntitySchema } = require("typeorm");
const { PlatformTools } = require("typeorm/platform/PlatformTools");

const memDb = newDb();
memDb.public.registerFunction({
  name: "version",
  returns: DataType.text,
  implementation: () => "PostgreSQL 16.4 (pg-mem)",
});
// Route TypeORM's lazy `pg` load through the pg-mem adapter.
const origLoad = PlatformTools.load.bind(PlatformTools);
PlatformTools.load = (name) => (name === "pg" ? memDb.adapters.createPg() : origLoad(name));

const schema = (name, tableName, columns) =>
  new EntitySchema({ name, tableName, columns });

const entities = [
  schema("UserBlock", "user_blocks", {
    userId: { type: "varchar", primary: true, name: "user_id" },
    blockedUserId: { type: "varchar", primary: true, name: "blocked_user_id" },
    createdAt: { type: "timestamp", createDate: true, name: "created_at" },
  }),
  schema("GameChallenge", "game_challenges", {
    id: { type: "int", primary: true, generated: true },
    fromUserId: { type: "varchar", name: "from_user_id" },
    fromUserName: { type: "varchar", nullable: true, name: "from_user_name" },
    toUserId: { type: "varchar", name: "to_user_id" },
    gameId: { type: "varchar", name: "game_id" },
    gameTitle: { type: "varchar", nullable: true, name: "game_title" },
    message: { type: "text", nullable: true },
    status: { type: "varchar", default: "pending" },
    createdAt: { type: "timestamp", createDate: true, name: "created_at" },
    updatedAt: { type: "timestamp", updateDate: true, name: "updated_at" },
    respondedAt: { type: "timestamp", nullable: true, name: "responded_at" },
  }),
  schema("Friend", "friends", {
    userId: { type: "varchar", primary: true, name: "user_id" },
    friendId: { type: "varchar", primary: true, name: "friend_id" },
    status: { type: "varchar", default: "pending" },
    createdAt: { type: "timestamp", createDate: true, name: "created_at" },
  }),
  schema("Notification", "notifications", {
    id: { type: "int", primary: true, generated: true },
    userId: { type: "varchar", name: "user_id" },
    type: { type: "varchar" },
    title: { type: "varchar" },
    body: { type: "text" },
    payload: { type: "jsonb", default: {} },
    isRead: { type: "boolean", default: false, name: "is_read" },
    createdAt: { type: "timestamp", createDate: true, name: "created_at" },
  }),
  schema("StudioComment", "studio_comments", {
    id: { type: "varchar", primary: true },
    sessionId: { type: "varchar", name: "session_id" },
    projectId: { type: "varchar", name: "project_id" },
    branchId: { type: "varchar", nullable: true, name: "branch_id" },
    checkpointId: { type: "varchar", nullable: true, name: "checkpoint_id" },
    trackId: { type: "varchar", nullable: true, name: "track_id" },
    clipId: { type: "varchar", nullable: true, name: "clip_id" },
    userId: { type: "varchar", name: "user_id" },
    content: { type: "text" },
    resolved: { type: "boolean", default: false },
    createdAt: { type: "timestamp", createDate: true, name: "created_at" },
    updatedAt: { type: "timestamp", updateDate: true, name: "updated_at" },
  }),
  schema("StudioApproval", "studio_approvals", {
    id: { type: "varchar", primary: true },
    sessionId: { type: "varchar", name: "session_id" },
    projectId: { type: "varchar", name: "project_id" },
    branchId: { type: "varchar", nullable: true, name: "branch_id" },
    checkpointId: { type: "varchar", nullable: true, name: "checkpoint_id" },
    createdById: { type: "varchar", name: "created_by_id" },
    approverIds: { type: "text", array: true, name: "approver_ids", default: () => "'{}'" },
    approvalStatus: { type: "jsonb", name: "approval_status", default: {} },
    overallStatus: { type: "varchar", name: "overall_status", default: "pending" },
    createdAt: { type: "timestamp", createDate: true, name: "created_at" },
    updatedAt: { type: "timestamp", updateDate: true, name: "updated_at" },
  }),
  schema("AsyncCollaborationPacket", "async_collaboration_packets", {
    id: { type: "varchar", primary: true },
    sessionId: { type: "varchar", name: "session_id" },
    fromUserId: { type: "varchar", name: "from_user_id" },
    toUserId: { type: "varchar", name: "to_user_id" },
    packetType: { type: "varchar", name: "packet_type" },
    status: { type: "varchar", default: "pending" },
    payload: { type: "jsonb", default: {} },
    responsePayload: { type: "jsonb", nullable: true, name: "response_payload" },
    createdAt: { type: "timestamp", createDate: true, name: "created_at" },
    appliedAt: { type: "timestamp", nullable: true, name: "applied_at" },
  }),
  schema("RemixLineage", "remix_lineage", {
    id: { type: "varchar", primary: true },
    remixProjectId: { type: "varchar", unique: true, name: "remix_project_id" },
    sourceProjectId: { type: "varchar", nullable: true, name: "source_project_id" },
    remixerId: { type: "varchar", name: "remixer_id" },
    lineage: { type: "jsonb", default: () => "'[]'" },
    depth: { type: "int", default: 1 },
    attribution: { type: "jsonb", default: {} },
    createdAt: { type: "timestamp", createDate: true, name: "created_at" },
    acceptedAt: { type: "timestamp", nullable: true, name: "accepted_at" },
  }),
];

const DDL = [
  `CREATE TABLE "game_challenges" (
    "id" SERIAL PRIMARY KEY, "from_user_id" character varying NOT NULL,
    "from_user_name" character varying, "to_user_id" character varying NOT NULL,
    "game_id" character varying NOT NULL, "game_title" character varying,
    "message" text, "status" character varying NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "responded_at" TIMESTAMP)`,
  `CREATE TABLE "user_blocks" (
    "user_id" VARCHAR(255) NOT NULL, "blocked_user_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("user_id", "blocked_user_id"))`,
  `CREATE TABLE "friends" (
    "user_id" character varying NOT NULL, "friend_id" character varying NOT NULL,
    "status" character varying NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY ("user_id", "friend_id"))`,
  `CREATE TABLE "notifications" (
    "id" SERIAL PRIMARY KEY, "user_id" character varying NOT NULL,
    "type" character varying NOT NULL, "title" character varying NOT NULL,
    "body" text NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}',
    "is_read" boolean NOT NULL DEFAULT false,
    "created_at" TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE "studio_comments" (
    "id" character varying PRIMARY KEY, "session_id" character varying NOT NULL,
    "project_id" character varying NOT NULL, "branch_id" character varying,
    "checkpoint_id" character varying, "track_id" character varying,
    "clip_id" character varying, "user_id" character varying NOT NULL,
    "content" text NOT NULL, "resolved" boolean NOT NULL DEFAULT false,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE "studio_approvals" (
    "id" character varying PRIMARY KEY, "session_id" character varying NOT NULL,
    "project_id" character varying NOT NULL, "branch_id" character varying,
    "checkpoint_id" character varying, "created_by_id" character varying NOT NULL,
    "approver_ids" text[] NOT NULL DEFAULT '{}',
    "approval_status" jsonb NOT NULL DEFAULT '{}',
    "overall_status" character varying NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE "async_collaboration_packets" (
    "id" character varying PRIMARY KEY, "session_id" character varying NOT NULL,
    "from_user_id" character varying NOT NULL, "to_user_id" character varying NOT NULL,
    "packet_type" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'pending',
    "payload" jsonb NOT NULL DEFAULT '{}', "response_payload" jsonb,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(), "applied_at" TIMESTAMP)`,
  `CREATE TABLE "remix_lineage" (
    "id" character varying PRIMARY KEY,
    "remix_project_id" character varying NOT NULL UNIQUE,
    "source_project_id" character varying, "remixer_id" character varying NOT NULL,
    "lineage" jsonb NOT NULL DEFAULT '[]', "depth" integer NOT NULL DEFAULT 1,
    "attribution" jsonb NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP NOT NULL DEFAULT now(), "accepted_at" TIMESTAMP)`,
];

let pass = 0;
let fail = 0;

function step(label, fn) {
  return fn()
    .then((res) => {
      pass += 1;
      let extra = "";
      if (res && res.raw?.[0]) extra = JSON.stringify(res.raw[0]).slice(0, 140);
      console.log(`  ✅ ${label}${extra ? ` → ${extra}` : ""}`);
      return res;
    })
    .catch((err) => {
      fail += 1;
      console.log(`  ❌ ${label}`);
      console.log(`     ${err.message.split("\n")[0]}`);
      if (err.query) console.log(`     SQL: ${err.query}`);
      return null;
    });
}

async function main() {
  const ds = new DataSource({
    type: "postgres",
    database: "smoke",
    entities,
    synchronize: false,
  });
  await ds.initialize();
  for (const ddl of DDL) await ds.query(ddl);
  console.log("schema + EntitySchema mirrors up\n");

  const userId = "6";
  const other = "7";

  console.log("— blocklist (fixed blockUser insert) —");
  await step("insert block (property keys) succeeds", () =>
    ds
      .createQueryBuilder()
      .insert()
      .into("user_blocks")
      .values({ userId, blockedUserId: other })
      .orIgnore()
      .execute(),
  );
  await step("duplicate block insert stays idempotent (orIgnore)", () =>
    ds
      .createQueryBuilder()
      .insert()
      .into("user_blocks")
      .values({ userId, blockedUserId: other })
      .orIgnore()
      .execute(),
  );

  console.log("\n— challenge list (fixed expireStaleChallenges) —");
  await step("expire-stale update (updatedAt property key)", () =>
    ds
      .createQueryBuilder()
      .update("game_challenges")
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        `status = 'pending' AND to_user_id = :userId AND created_at < (CURRENT_TIMESTAMP - INTERVAL '7 days')`,
        { userId },
      )
      .execute(),
  );
  await step("listChallenges select still works", async () => {
    const rows = await ds
      .getRepository("GameChallenge")
      .createQueryBuilder("c")
      .where("(c.to_user_id = :userId OR c.from_user_id = :userId)", { userId })
      .orderBy("c.created_at", "DESC")
      .take(50)
      .getMany();
    return { rows: rows.length };
  });

  console.log("\n— notifications (fixed markNotificationRead) —");
  const notif = await ds
    .createQueryBuilder()
    .insert()
    .into("notifications")
    .values({ userId, type: "x", title: "t", body: "b" })
    .returning(["id"])
    .execute();
  const notifId = notif.raw[0]?.id ?? notif.generatedMaps[0]?.id;
  await step("markNotificationRead update (isRead property key)", () =>
    ds
      .createQueryBuilder()
      .update("notifications")
      .set({ isRead: true })
      .where("id = :id AND user_id = :userId", { id: notifId, userId })
      .execute(),
  );

  console.log("\n— friends (fixed upsertFriend) —");
  await step("friend upsert (property keys) succeeds", () =>
    ds
      .createQueryBuilder()
      .insert()
      .into("friends")
      .values({ userId, friendId: other, status: "accepted" })
      .orUpdate(["status"], ["user_id", "friend_id"])
      .execute(),
  );

  console.log("\n— studio socket QBs (fixed property keys) —");
  await step("studio_comments insert", () =>
    ds
      .createQueryBuilder()
      .insert()
      .into("studio_comments")
      .values({
        id: "qa-c1",
        sessionId: "s1",
        projectId: "p1",
        userId,
        content: "hello",
      })
      .execute(),
  );
  await step("studio_comments resolve update", () =>
    ds
      .createQueryBuilder()
      .update("studio_comments")
      .set({ resolved: true, updatedAt: new Date() })
      .where("id = :id AND session_id = :sessionId", { id: "qa-c1", sessionId: "s1" })
      .execute(),
  );
  await step("studio_approvals insert", () =>
    ds
      .createQueryBuilder()
      .insert()
      .into("studio_approvals")
      .values({
        id: "qa-a1",
        sessionId: "s1",
        projectId: "p1",
        createdById: userId,
        approverIds: [userId],
      })
      .execute(),
  );
  await step("studio_approvals submit update", () =>
    ds
      .createQueryBuilder()
      .update("studio_approvals")
      .set({ approvalStatus: { [userId]: { status: "approved" } }, overallStatus: "approved", updatedAt: new Date() })
      .where("id = :id", { id: "qa-a1" })
      .execute(),
  );
  await step("async_collaboration_packets insert", () =>
    ds
      .createQueryBuilder()
      .insert()
      .into("async_collaboration_packets")
      .values({ id: "qa-p1", sessionId: "s1", fromUserId: userId, toUserId: other, packetType: "review_request", payload: {} })
      .execute(),
  );
  await step("async_collaboration_packets apply update", () =>
    ds
      .createQueryBuilder()
      .update("async_collaboration_packets")
      .set({ status: "applied", responsePayload: { ok: true }, appliedAt: new Date() })
      .where("id = :id AND to_user_id = :userId", { id: "qa-p1", userId })
      .returning(["session_id", "from_user_id"])
      .execute(),
  );
  await step("remix_lineage insert (orUpdate property keys)", () =>
    ds
      .createQueryBuilder()
      .insert()
      .into("remix_lineage")
      .values({ id: "l1", remixProjectId: "r1", sourceProjectId: "s0", remixerId: userId, lineage: [], depth: 1, attribution: {} })
      .orUpdate(["source_project_id", "remixer_id", "lineage", "depth", "attribution"], ["remix_project_id"])
      .execute(),
  );

  await ds.destroy();
  console.log(`\n===== VERIFY SUMMARY: ${pass} passed, ${fail} failed =====`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error("HARNESS ERROR:", err);
  process.exit(1);
});