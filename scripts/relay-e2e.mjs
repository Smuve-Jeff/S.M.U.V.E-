#!/usr/bin/env node
/**
 * Provision and run the relay's end-to-end media suite.
 *
 * The suite needs three things that are not project dependencies: an ffmpeg
 * binary, a MediaMTX binary and the werift WebRTC library. Fetching them by hand
 * (and getting the three env vars right) is enough friction that the test would
 * simply never run, so this does it:
 *
 *   npm run test:relay:e2e:setup              provision what is missing, then run
 *   npm run test:relay:e2e:setup -- --provision-only
 *   npm run test:relay:e2e:setup -- --force   re-install / re-download anyway
 *
 * Everything lands in node_modules/.e2e, which is already ignored by git, so a
 * checkout stays clean and the binaries survive between runs. If a download is
 * not possible (offline, unsupported platform), the suite still skips cleanly —
 * this script is a convenience, never a requirement.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tools = path.join(root, "node_modules", ".e2e");
const ffmpegPath = path.join(tools, "node_modules", "ffmpeg-static", "ffmpeg");
const weriftPath = path.join(tools, "node_modules", "werift");
const mediaMtxPath = path.join(tools, "mediamtx");

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const provisionOnly = args.has("--provision-only");

const log = (line) => console.log(`[relay-e2e] ${line}`);

function fail(message) {
  console.error(`[relay-e2e] ${message}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    cwd: root,
    ...options,
  });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  return result.status ?? 1;
}

/** ffmpeg (from ffmpeg-static) and werift are npm packages; fetch them together
 * so installing one does not prune the other out of the tool directory. */
function provisionPackages() {
  const haveBoth = existsSync(ffmpegPath) && existsSync(weriftPath);
  if (haveBoth && !force) {
    log("ffmpeg and werift already provisioned");
    return;
  }
  mkdirSync(tools, { recursive: true });
  log("installing ffmpeg-static and werift (this is the slow step, ~80 MB)");
  const status = run("npm", [
    "install",
    "--prefix",
    tools,
    "--no-save",
    "--no-audit",
    "--no-fund",
    "ffmpeg-static",
    "werift",
  ]);
  if (status !== 0) fail("npm could not install ffmpeg-static and werift");
  if (!existsSync(ffmpegPath)) fail(`ffmpeg-static did not produce ${ffmpegPath}`);
  if (!existsSync(path.join(weriftPath, "lib", "webrtc", "src", "index.js"))) {
    fail(`werift did not produce a usable module in ${weriftPath}`);
  }
  log("ffmpeg and werift ready");
}

/** MediaMTX ships as a static binary in a release tarball, not on npm. */
function mediaMtxAsset() {
  const version = process.env.E2E_MEDIAMTX_VERSION || "1.11.3";
  const platforms = {
    "linux-x64": "linux_amd64",
    "linux-arm64": "linux_arm64v8",
    "darwin-x64": "darwin_amd64",
    "darwin-arm64": "darwin_arm64",
  };
  const suffix = platforms[`${process.platform}-${process.arch}`];
  if (!suffix) {
    fail(
      `no MediaMTX build is known for ${process.platform}-${process.arch}. ` +
        "Install mediamtx yourself and run the suite with MEDIAMTX_PATH set.",
    );
  }
  return {
    version,
    file: `mediamtx_v${version}_${suffix}.tar.gz`,
    url: `https://github.com/bluenviron/mediamtx/releases/download/v${version}/mediamtx_v${version}_${suffix}.tar.gz`,
  };
}

function works(binary, flag) {
  for (const prefix of ["-", "--"]) {
    if (spawnSync(binary, [`${prefix}${flag}`], { stdio: "ignore" }).status === 0) {
      return true;
    }
  }
  return false;
}

async function provisionMediaMtx() {
  if (existsSync(mediaMtxPath) && works(mediaMtxPath, "version") && !force) {
    log("MediaMTX already provisioned");
    return;
  }
  const asset = mediaMtxAsset();
  mkdirSync(tools, { recursive: true });
  log(`downloading MediaMTX v${asset.version} (${asset.file})`);
  const response = await fetch(asset.url).catch((error) => {
    fail(`could not download MediaMTX: ${error.message}`);
  });
  if (!response.ok) {
    fail(`MediaMTX download failed with HTTP ${response.status} from ${asset.url}`);
  }
  // Keep the download inside the workspace; nothing outside it is touched.
  const archivePath = path.join(tools, asset.file);
  writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
  const status = run("tar", ["-xzf", archivePath, "-C", tools, "mediamtx"]);
  rmSync(archivePath, { force: true });
  if (status !== 0) fail("could not extract MediaMTX from its tarball");
  chmodSync(mediaMtxPath, 0o755);
  if (!works(mediaMtxPath, "version")) {
    fail(`${mediaMtxPath} does not run on this machine`);
  }
  log("MediaMTX ready");
}

async function main() {
  provisionPackages();
  await provisionMediaMtx();

  log(`ffmpeg:   ${ffmpegPath}`);
  log(`mediatmx: ${mediaMtxPath}`);
  log(`werift:   ${weriftPath}`);

  if (provisionOnly) return 0;

  log("running the end-to-end media suite");
  return run(
    process.execPath,
    ["--test", "relay/test/e2e-media.test.mjs"],
    {
      env: {
        ...process.env,
        RELAY_FFMPEG_PATH: ffmpegPath,
        MEDIAMTX_PATH: mediaMtxPath,
        RELAY_WERIFT_PATH: weriftPath,
      },
    },
  );
}

main()
  .then((status) => process.exit(status))
  .catch((error) => {
    console.error(`[relay-e2e] ${error?.stack ?? error}`);
    process.exit(1);
  });
