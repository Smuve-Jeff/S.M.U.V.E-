import type { QueryRunner } from "typeorm";
import { CreateUsersAndProducts1786243200000 } from "./1786243200000-CreateUsersAndProducts";
import { CreateSocialTables1786243200001 } from "./1786243200001-CreateSocialTables";
import { CreateGameInvites1786243200002 } from "./1786243200002-CreateGameInvites";
import { CreateLiveStreams1786243200003 } from "./1786243200003-CreateLiveStreams";
import { CreateUserBlocks1786243200004 } from "./1786243200004-CreateUserBlocks";
import { CreateChallengeDedupeIndex1786243200005 } from "./1786243200005-CreateChallengeDedupeIndex";
import { CreateRoomMessages1786243200006 } from "./1786243200006-CreateRoomMessages";

/**
 * Metadata per migration drives dialect assertions:
 *  - `hasSerialColumn`: migration creates a table with an auto-increment
 *    PK (SERIAL on PG, AUTO_INCREMENT on MySQL/Vitess).
 *  - `hasJson`: migration creates a JSON column (jsonb on PG, json on MySQL).
 * Index-only migrations (e.g. the challenge-dedupe guard) have neither.
 */
interface MigrationEntry {
  migration: { name: string; up: (q: QueryRunner) => Promise<void>; down: (q: QueryRunner) => Promise<void> };
  hasSerialColumn: boolean;
  hasJson: boolean;
}

const migrations: MigrationEntry[] = [
  { migration: new CreateUsersAndProducts1786243200000(), hasSerialColumn: true, hasJson: false },
  { migration: new CreateSocialTables1786243200001(), hasSerialColumn: true, hasJson: true },
  { migration: new CreateGameInvites1786243200002(), hasSerialColumn: true, hasJson: true },
  { migration: new CreateLiveStreams1786243200003(), hasSerialColumn: true, hasJson: true },
  { migration: new CreateUserBlocks1786243200004(), hasSerialColumn: false, hasJson: false },
  { migration: new CreateChallengeDedupeIndex1786243200005(), hasSerialColumn: false, hasJson: false },
  { migration: new CreateRoomMessages1786243200006(), hasSerialColumn: true, hasJson: false },
];

const migrationNames = [
  "CreateUsersAndProducts1786243200000",
  "CreateSocialTables1786243200001",
  "CreateGameInvites1786243200002",
  "CreateLiveStreams1786243200003",
  "CreateUserBlocks1786243200004",
  "CreateChallengeDedupeIndex1786243200005",
  "CreateRoomMessages1786243200006",
];

/** Stand-in QueryRunner that records every statement it is asked to run. */
function makeRunner(type: "postgres" | "mysql"): { queries: string[]; runner: QueryRunner } {
  const queries: string[] = [];
  const runner: QueryRunner = {
    connection: { options: { type } },
    query: async (sql: string): Promise<unknown> => {
      queries.push(sql);
      return undefined;
    },
  } as unknown as QueryRunner;
  return { queries, runner };
}

/** Run a migration's `up` and return the concatenated SQL it emitted. */
async function runUp(
  migration: { up: (q: QueryRunner) => Promise<void> },
  type: "postgres" | "mysql",
): Promise<string> {
  const { queries, runner } = makeRunner(type);
  await migration.up(runner);
  return queries.join("\n");
}

/** Collapse whitespace so multi-line template DDL matches single-line strings. */
const normalizeSql = (sql: string): string => sql.replace(/\s+/g, " ").trim();

describe("database migrations (dialect-aware)", () => {
  it("are uniquely named", () => {
    const names = migrations.map((m) => m.migration.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(migrationNames);
  });

  it("produces PostgreSQL DDL on the postgres branch", async () => {
    for (const entry of migrations) {
      const { queries, runner } = makeRunner("postgres");
      await entry.migration.up(runner);
      const sql = queries.join("\n");
      expect(sql).toContain('"'); // PG quoted identifiers
      expect(sql).not.toContain("AUTO_INCREMENT");
      if (entry.hasSerialColumn) expect(sql).toContain("SERIAL"); // PG auto-increment
      if (entry.hasJson) expect(sql).toContain("jsonb"); // PG JSON columns
    }
  });

  it("produces MySQL/Vitess DDL on the mysql branch", async () => {
    for (const entry of migrations) {
      const { queries, runner } = makeRunner("mysql");
      await entry.migration.up(runner);
      const sql = queries.join("\n");
      expect(sql).not.toContain("jsonb");
      expect(sql).not.toContain("SERIAL");
      expect(sql).not.toContain('"'); // Vitess: bare identifiers
      expect(sql).not.toContain("DESC"); // Vitess: no descending indexes
      expect(sql).not.toMatch(/FOREIGN KEY/i); // Vitess: no FK constraints
      if (entry.hasSerialColumn) expect(sql).toContain("AUTO_INCREMENT");
      if (entry.hasJson) expect(sql).toContain("json"); // MySQL JSON columns
    }
  });

  it("runs idempotent down migrations for both dialects", async () => {
    for (const entry of [...migrations].reverse()) {
      for (const type of ["postgres", "mysql"] as const) {
        const { runner } = makeRunner(type);
        await expect(entry.migration.down(runner)).resolves.toBeUndefined();
      }
    }
  });

  it("emits the exact critical DDL fragments for the new migrations", async () => {
    // 0004 — user_blocks: composite PK + reverse-direction index.
    const pg4 = normalizeSql(await runUp(new CreateUserBlocks1786243200004(), "postgres"));
    expect(pg4).toContain('PRIMARY KEY ("user_id", "blocked_user_id")');
    expect(pg4).toContain(
      'CREATE INDEX IF NOT EXISTS "user_blocks_blocked_idx" ON "user_blocks" ("blocked_user_id")',
    );
    const my4 = normalizeSql(await runUp(new CreateUserBlocks1786243200004(), "mysql"));
    expect(my4).toContain("PRIMARY KEY (user_id, blocked_user_id)");
    expect(my4).toContain(
      "CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_user_id)",
    );

    // 0005 — challenge dedupe: the PG partial index MUST stay scoped to
    // pending rows (a global unique index would wrongly block re-issuing a
    // resolved challenge); the MySQL branch must use the NULL-able
    // generated-column trick (no partial-index support).
    const pg5 = normalizeSql(await runUp(new CreateChallengeDedupeIndex1786243200005(), "postgres"));
    expect(pg5).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_game_challenges_pending"',
    );
    expect(pg5).toContain('WHERE "status" = \'pending\'');
    const my5 = normalizeSql(await runUp(new CreateChallengeDedupeIndex1786243200005(), "mysql"));
    expect(my5).toContain("GENERATED ALWAYS AS");
    expect(my5).toContain("CASE WHEN status = 'pending'");
    expect(my5).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_game_challenges_pending ON game_challenges (pending_key)",
    );

    // 0006 — room_messages: history lookup index (room_id, created_at).
    const pg6 = normalizeSql(await runUp(new CreateRoomMessages1786243200006(), "postgres"));
    expect(pg6).toContain('"id" SERIAL PRIMARY KEY');
    expect(pg6).toContain('ON "room_messages" ("room_id", "created_at")');
    const my6 = normalizeSql(await runUp(new CreateRoomMessages1786243200006(), "mysql"));
    expect(my6).toContain("id int AUTO_INCREMENT PRIMARY KEY");
    expect(my6).toContain("ON room_messages (room_id, created_at)");
  });
});
