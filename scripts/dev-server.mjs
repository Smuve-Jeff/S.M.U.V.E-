#!/usr/bin/env node
/**
 * Dev server with per-session preview host allowlisting.
 *
 * Angular's `allowedHosts` lives in angular.json, which cannot know the VM's
 * preview hostname. Passing that host through `PREVIEW_HOST` keeps the static
 * production allowlist and the host check intact — instead of disabling the
 * check or wildcarding *.style.dev.
 *
 *   PREVIEW_HOST=my-preview.style.dev npm run dev
 *   PREVIEW_HOST=one.style.dev,two.style.dev PORT=3000 npm run dev
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const angular = JSON.parse(
  readFileSync(path.join(root, "angular.json"), "utf8"),
);
const projectName =
  angular.defaultProject ?? Object.keys(angular.projects ?? {})[0];
const serveOptions =
  angular.projects?.[projectName]?.architect?.serve?.options ?? {};

if (!projectName || !angular.projects?.[projectName]) {
  console.error("dev-server: angular.json declares no default project");
  process.exit(1);
}

const configuredHosts = Array.isArray(serveOptions.allowedHosts)
  ? serveOptions.allowedHosts
  : [];
const previewHosts = [process.env.PREVIEW_HOST, process.env.PREVIEW_HOSTNAME]
  .filter(Boolean)
  .flatMap((value) => String(value).split(","))
  .map((host) => host.trim())
  .filter(Boolean);

const allowedHosts = [
  ...new Set([...configuredHosts, ...previewHosts, "localhost", "127.0.0.1"]),
];
const port = String(process.env.PORT || serveOptions.port || 4200);

if (previewHosts.length === 0) {
  console.warn(
    "dev-server: PREVIEW_HOST is not set; only local and configured hosts are allowed.",
  );
}

const args = [
  "serve",
  "--host",
  "0.0.0.0",
  "--port",
  port,
  "--configuration",
  "development",
  ...allowedHosts.flatMap((host) => ["--allowed-hosts", host]),
  ...process.argv.slice(2),
];

console.log(`dev-server: ${allowedHosts.length} allowed host(s)`);
console.log(`dev-server: ${allowedHosts.join(", ")}`);
console.log(`dev-server: http://0.0.0.0:${port}/`);

const ngCli = path.join(
  root,
  "node_modules",
  "@angular",
  "cli",
  "bin",
  "ng.js",
);
const child = spawn(process.execPath, [ngCli, ...args], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(`dev-server: failed to start ng serve · ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal && process.platform !== "win32") {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
