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
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tools = path.join(root, "node_modules", ".e2e");
const ffmpegPath = path.join(tools, "node_modules", "ffmpeg-static", "ffmpeg");
const weriftPath = path.join(tools, "node_modules", "werift");
const mediaMtxPath = path.join(tools, "mediamtx");

/**
 * A second WHIP client needs an ffmpeg that was built with the `whip` muxer.
 * The static `ffmpeg-static` build does not have it — it answers `Unknown format
 * 'whip'` — so the second-client test gets its own binary. BtbN's builds include
 * it; only linux-x64 has a known asset, and elsewhere the test skips.
 */
const WHIP_TOOLS_DIR = "whip-ffmpeg";
const WHIP_ASSET = "ffmpeg-master-latest-linux64-gpl";
const whipFfmpegPath = path.join(tools, WHIP_TOOLS_DIR, "bin", "ffmpeg");

/**
 * Pinned rather than "latest": CI caches this directory, and a cache that holds
 * whatever npm resolved first would freeze an untested toolchain — or, worse,
 * silently swap it when the cache misses. Bumping a version here invalidates the
 * cache key, because the workflow keys on a hash of this file.
 */
const TOOL_PACKAGES = { "ffmpeg-static": "5.3.0", werift: "0.27.0" };

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
/** Versions actually on disk, so a stale cache is noticed instead of trusted. */
function installedVersions() {
  const installed = {};
  for (const name of Object.keys(TOOL_PACKAGES)) {
    try {
      const manifest = path.join(tools, "node_modules", name, "package.json");
      installed[name] = JSON.parse(readFileSync(manifest, "utf8")).version;
    } catch {
      installed[name] = null;
    }
  }
  return installed;
}

function provisionPackages() {
  const haveBoth = existsSync(ffmpegPath) && existsSync(weriftPath);
  const installed = installedVersions();
  const pinned = Object.entries(TOOL_PACKAGES).every(
    ([name, version]) => installed[name] === version,
  );
  if (haveBoth && pinned && !force) {
    log(
      `ffmpeg and werift already provisioned (${Object.entries(installed)
        .map(([name, version]) => `${name}@${version}`)
        .join(", ")})`,
    );
    return;
  }
  if (haveBoth && !pinned) {
    log(
      `installed tools do not match the pins (${Object.entries(installed)
        .map(([name, version]) => `${name}@${version}`)
        .join(", ")}); installing the pinned versions`,
    );
  }
  mkdirSync(tools, { recursive: true });
  log("installing the pinned ffmpeg-static and werift (the slow step, ~80 MB)");
  const status = run("npm", [
    "install",
    "--prefix",
    tools,
    "--no-save",
    "--no-audit",
    "--no-fund",
    ...Object.entries(TOOL_PACKAGES).map(([name, version]) => `${name}@${version}`),
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

function ffmpegHasWhipMuxer(binary) {
  const result = spawnSync(binary, ["-hide_banner", "-muxers"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && /\bwhip\b/.test(result.stdout ?? "");
}

function ffmpegVersion(binary) {
  const result = spawnSync(binary, ["-hide_banner", "-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return (result.stdout ?? "").split("\n")[0].trim() || "unknown version";
}

async function provisionWhipFfmpeg() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    log(
      `no WHIP-capable ffmpeg is known for ${process.platform}-${process.arch}; ` +
        "the second-client check will skip",
    );
    return null;
  }
  if (existsSync(whipFfmpegPath) && ffmpegHasWhipMuxer(whipFfmpegPath) && !force) {
    log(`WHIP-capable ffmpeg already provisioned (${ffmpegVersion(whipFfmpegPath)})`);
    return whipFfmpegPath;
  }
  const asset = `${WHIP_ASSET}.tar.xz`;
  const url = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${asset}`;
  log(`downloading a WHIP-capable ffmpeg (${asset}, ~150 MB)`);
  const response = await fetch(url).catch((error) => {
    fail(`could not download the WHIP-capable ffmpeg: ${error.message}`);
  });
  if (!response.ok) {
    fail(`the WHIP-capable ffmpeg download failed with HTTP ${response.status} from ${url}`);
  }
  const archivePath = path.join(tools, asset);
  writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
  const status = run("tar", ["-xJf", archivePath, "-C", tools]);
  rmSync(archivePath, { force: true });
  if (status !== 0) fail("could not extract the WHIP-capable ffmpeg from its tarball");
  rmSync(path.join(tools, WHIP_TOOLS_DIR), { recursive: true, force: true });
  renameSync(path.join(tools, WHIP_ASSET), path.join(tools, WHIP_TOOLS_DIR));
  // The archive carries ffplay, ffprobe, docs and man pages: ~500 MB of it is
  // never used here, and CI caches this directory.
  for (const unused of ["bin/ffplay", "bin/ffprobe", "doc", "man", "presets"]) {
    rmSync(path.join(tools, WHIP_TOOLS_DIR, unused), { recursive: true, force: true });
  }
  chmodSync(whipFfmpegPath, 0o755);
  if (!ffmpegHasWhipMuxer(whipFfmpegPath)) {
    fail(`${whipFfmpegPath} does not report a whip muxer; the master build may have changed`);
  }
  log(`WHIP-capable ffmpeg ready (${ffmpegVersion(whipFfmpegPath)})`);
  return whipFfmpegPath;
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
  const whipFfmpeg = await provisionWhipFfmpeg();

  log(`ffmpeg:   ${ffmpegPath}`);
  log(`mediatmx: ${mediaMtxPath}`);
  log(`werift:   ${weriftPath}`);
  if (whipFfmpeg) log(`whip ffmpeg: ${whipFfmpeg}`);

  if (provisionOnly) return 0;

  log("running the end-to-end media suite");
  // Through npm so there is one definition of the command (it carries the
  // --test-force-exit that keeps a wedged child from holding the job open).
  return run("npm", ["run", "test:relay:e2e"], {
    env: {
      ...process.env,
      RELAY_FFMPEG_PATH: ffmpegPath,
      MEDIAMTX_PATH: mediaMtxPath,
      RELAY_WERIFT_PATH: weriftPath,
      ...(whipFfmpeg ? { RELAY_WHIP_FFMPEG_PATH: whipFfmpeg } : {}),
    },
  });
}

main()
  .then((status) => process.exit(status))
  .catch((error) => {
    console.error(`[relay-e2e] ${error?.stack ?? error}`);
    process.exit(1);
  });
