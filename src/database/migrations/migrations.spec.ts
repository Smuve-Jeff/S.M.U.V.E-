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
});
