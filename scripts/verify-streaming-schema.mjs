#!/usr/bin/env node
/**
 * Prove the streaming schema gate without a real database.
 *
 * The API refuses to boot when `streaming_accounts` is missing, and that refusal
 * is the last line of defence before a host presses Connect on a deployment
 * whose migrations were never applied. This checks both halves of it against a
 * throwaway PostgreSQL:
 *
 *   1. with an empty database, boot must fail and name the missing table;
 *   2. after the migrations, boot must reach `OAuth ready` and answer
 *      `/api/health` with 200.
 *
 * Everything stays in node_modules: a portable PostgreSQL is installed into
 * `node_modules/.pgverify` and its data directory is deleted afterwards. The
 * provider credentials below are dummy strings — nothing here contacts a
 * provider, and no real database is touched.
 *
 *   npm run verify:streaming-schema
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tools = path.join(root, "node_modules", ".pgverify");
const dataDir = path.join(root, "node_modules", ".pgverify-data");
const apiEntry = path.join(root, "Build", "api", "index.js");
const PG_PORT = Number(process.env.VERIFY_PG_PORT) || 55433;
const API_PORT = Number(process.env.VERIFY_API_PORT) || 4055;
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/verify`;

const failures = [];
function check(label, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failures.push(detail ? `${label}: ${detail}` : label);
  return ok;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: root,
    ...options,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/** The API is run from its compiled output, exactly as a deployment would. */
function ensureCompiledApi() {
  if (existsSync(apiEntry)) return true;
  console.log("Build/api is missing; running the server build first");
  return run("npm", ["run", "build:server"]) === 0;
}

function ensurePostgres() {
  const binary = path.join(
    tools,
    "node_modules",
    "@embedded-postgres",
    "linux-x64",
    "native",
    "bin",
    "postgres",
  );
  if (existsSync(binary)) return true;
  console.log("installing the portable PostgreSQL (once, ~60 MB)");
  return (
    run("npm", [
      "install",
      "--prefix",
      tools,
      "--no-save",
      "--no-audit",
      "--no-fund",
      "embedded-postgres",
    ]) === 0
  );
}

/**
 * Boot the API and collect what it printed. With `waitForExit` the boot is
 * expected to refuse; otherwise the run waits for a healthy `/api/health`.
 */
async function bootApi({ waitForExit }) {
  const child = spawn(process.execPath, [apiEntry], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(API_PORT),
      DATABASE_URL,
      JWT_SECRET: "verify-streaming-schema-secret",
      API_PUBLIC_URL: `http://localhost:${API_PORT}`,
      TWITCH_CLIENT_ID: "dummy-client-id",
      TWITCH_CLIENT_SECRET: "dummy-client-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const lines = [];
  const collect = (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (line.trim()) lines.push(line.trim());
    }
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const deadline = Date.now() + 45_000;
  let health = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    if (!waitForExit) {
      try {
        const response = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
        if (response.ok) {
          health = await response.json();
          break;
        }
      } catch {
        // Not listening yet.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const exitCode = child.exitCode;
  if (exitCode === null) child.kill("SIGKILL");
  return { exitCode, lines, health };
}

async function main() {
  if (!ensureCompiledApi()) throw new Error("could not build Build/api");
  if (!ensurePostgres()) throw new Error("could not install PostgreSQL");

  const requireRoot = createRequire(path.join(root, "package.json"));
  const requireTools = createRequire(path.join(tools, "package.json"));
  const { DataSource } = requireRoot("typeorm");
  const Module = requireTools("embedded-postgres");
  const EmbeddedPostgres = Module.default ?? Module;

  rmSync(dataDir, { recursive: true, force: true });
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: PG_PORT,
    persistent: false,
  });

  await server.initialise();
  await server.start();
  await server.createDatabase("verify");

  try {
    console.log("\n1) boot with no migrations applied — must refuse");
    const missing = await bootApi({ waitForExit: true });
    const said = missing.lines.join("\n");
    check(
      "boot fails on the missing grants table",
      missing.exitCode !== 0 &&
        /streaming_accounts table is missing/.test(said),
      missing.exitCode === 0
        ? "the API booted against an empty database"
        : said.slice(-200),
    );

    console.log("\n2) apply every migration");
    const ds = new DataSource({
      type: "postgres",
      url: DATABASE_URL,
      synchronize: false,
      entities: [],
      migrations: [path.join(root, "Build/api/database/migrations/*.js")],
    });
    await ds.initialize();
    const applied = await ds.runMigrations();
    check("migrations applied", applied.length > 0, "nothing was applied");
    const tables = await ds.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('streaming_accounts','streaming_destinations')`,
    );
    check(
      "both streaming tables exist",
      tables.length === 2,
      `found: ${tables.map((t) => t.table_name).join(", ") || "none"}`,
    );
    await ds.destroy();

    console.log("\n3) boot after the migrations — must serve");
    const ready = await bootApi({ waitForExit: false });
    check(
      "boot reports the grants table ready",
      /OAuth ready for twitch/.test(ready.lines.join("\n")),
      ready.lines.slice(-5).join(" | "),
    );
    check(
      "health answers 200 with the database up",
      ready.health?.status === "ok" && ready.health?.db === "up",
      JSON.stringify(ready.health),
    );
  } finally {
    await server.stop().catch(() => {});
    rmSync(dataDir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log("\nthe schema gate behaves: refuses without the table, serves with it");
  return 0;
}

main()
  .then((status) => process.exit(status))
  .catch((error) => {
    console.error(`[verify-streaming-schema] ${error?.message ?? error}`);
    process.exit(1);
  });
