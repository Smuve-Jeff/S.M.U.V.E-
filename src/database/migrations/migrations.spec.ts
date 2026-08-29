import type { QueryRunner } from "typeorm";
import { CreateUsersAndProducts1786243200000 } from "./1786243200000-CreateUsersAndProducts";
import { CreateSocialTables1786243200001 } from "./1786243200001-CreateSocialTables";
import { CreateGameInvites1786243200002 } from "./1786243200002-CreateGameInvites";
import { CreateLiveStreams1786243200003 } from "./1786243200003-CreateLiveStreams";

const migrations = [
  new CreateUsersAndProducts1786243200000(),
  new CreateSocialTables1786243200001(),
  new CreateGameInvites1786243200002(),
  new CreateLiveStreams1786243200003(),
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

const postgresMigrations = [
  "CreateUsersAndProducts1786243200000",
  "CreateSocialTables1786243200001",
  "CreateGameInvites1786243200002",
  "CreateLiveStreams1786243200003",
];

describe("database migrations (dialect-aware)", () => {
  it("are uniquely named", () => {
    const names = migrations.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(postgresMigrations);
  });

  it("produces PostgreSQL DDL on the postgres branch", async () => {
    for (const [index, migration] of migrations.entries()) {
      const { queries, runner } = makeRunner("postgres");
      await migration.up(runner);
      const sql = queries.join("\n");
      expect(sql).toContain("SERIAL"); // PG auto-increment
      expect(sql).toContain('"'); // PG quoted identifiers
      expect(sql).not.toContain("AUTO_INCREMENT");
      if (index > 0) expect(sql).toContain("jsonb"); // PG JSON columns
    }
  });

  it("produces MySQL/Vitess DDL on the mysql branch", async () => {
    for (const [index, migration] of migrations.entries()) {
      const { queries, runner } = makeRunner("mysql");
      await migration.up(runner);
      const sql = queries.join("\n");
      expect(sql).toContain("AUTO_INCREMENT");
      expect(sql).not.toContain("jsonb");
      expect(sql).not.toContain("SERIAL");
      expect(sql).not.toContain('"'); // Vitess: bare identifiers
      expect(sql).not.toContain("DESC"); // Vitess: no descending indexes
      expect(sql).not.toMatch(/FOREIGN KEY/i); // Vitess: no FK constraints
      if (index > 0) expect(sql).toContain("json"); // MySQL JSON columns
    }
  });

  it("runs idempotent down migrations for both dialects", async () => {
    for (const migration of [...migrations].reverse()) {
      for (const type of ["postgres", "mysql"] as const) {
        const { runner } = makeRunner(type);
        await expect(migration.down(runner)).resolves.toBeUndefined();
      }
    }
  });
});