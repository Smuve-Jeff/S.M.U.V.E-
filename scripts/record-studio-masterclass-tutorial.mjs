#!/usr/bin/env node
/**
 * Record the Studio Masterclass First Loop walkthrough in S.M.U.V.E. Prime voice.
 *
 * Wide:
 *   node scripts/record-studio-masterclass-demo.mjs
 *
 * 9:16 Short:
 *   DEMO_FORMAT=short node scripts/record-studio-masterclass-demo.mjs
 *
 * One-time browser setup:
 *   npx playwright install chromium
 *   sudo npx playwright install-deps chromium   # Linux only; only if needed
 *
 * The script starts the Angular dev server on DEMO_PORT (default 4310), seeds a
 * local test session, stubs `/api/**`, and records:
 *
 *   shared lesson link -> Quick Session -> starter groove -> completion ->
 *   next lesson
 *
 * Outputs:
 *   artifacts/studio-masterclass-thumbnail.png
 *   artifacts/studio-masterclass-first-loop.webm
 *   artifacts/studio-masterclass-first-loop.mp4       (with ffmpeg)
 *   artifacts/studio-masterclass-first-loop-short.webm
 *   artifacts/studio-masterclass-first-loop-short.mp4 (with ffmpeg)
 *   artifacts/studio-masterclass-first-loop-short.srt  (Short captions)
 *
 * Narration:
 *   The persona voiceover is written to
 *   artifacts/studio-masterclass-narration.txt.
 *   Supply NARRATION_AUDIO=/path/voice.wav, or install a local TTS engine
 *   (`espeak-ng`, `espeak`, macOS `say`, `pico2wave`, or `flite`). ffmpeg muxes
 *   the voice track into the MP4; without ffmpeg the WebM stays silent.
 *
 * Prime voice rotation:
 *   PRIME_VOICE_ROTATION=1 uses Edge TTS to give each sentence a different
 *   Prime-capable voice. Set PRIME_VOICE_SEED for a repeatable rotation:
 *
 *   PRIME_VOICE_ROTATION=1 PRIME_VOICE_SEED=20261110 \
 *   node scripts/record-studio-masterclass-demo.mjs
 *
 *   Raise DEMO_HOLD (default 1.5 wide / 1 Short) if a custom narration is
 *   longer than the cut; ffmpeg would otherwise stop at the last video frame.
 *
 * YouTube upload (opt-in; unlisted by default):
 *   YOUTUBE_UPLOAD=1 \
 *   YOUTUBE_CLIENT_ID=... \
 *   YOUTUBE_CLIENT_SECRET=... \
 *   YOUTUBE_REFRESH_TOKEN=... \
 *   node scripts/record-studio-masterclass-demo.mjs
 *
 * The OAuth client needs the YouTube Data API v3 and the
 * `https://www.googleapis.com/auth/youtube.upload` scope. Mint a refresh token
 * without writing it to disk:
 *
 *   YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... node scripts/youtube-oauth.mjs
 *
 * Set YOUTUBE_PRIVACY=public only when the cut has been reviewed.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env.DEMO_PORT || 4310);
const BASE_URL =
  process.env.DEMO_BASE_URL?.replace(/\/$/, "") || `http://127.0.0.1:${PORT}`;
const SHORT = process.env.DEMO_FORMAT === "short";
const VIEWPORT = SHORT
  ? { width: 540, height: 960 }
  : { width: 1280, height: 720 };
const THUMB_VIEWPORT = SHORT
  ? { width: 1080, height: 1920 }
  : { width: 1280, height: 720 };
const STEM = SHORT
  ? "studio-masterclass-tutorial-short"
  : "studio-masterclass-tutorial";
const OUT_DIR = path.join(ROOT, "artifacts");
const WEBM = path.join(OUT_DIR, `${STEM}.webm`);
const MP4 = path.join(OUT_DIR, `${STEM}.mp4`);
const THUMBNAIL = path.join(
  OUT_DIR,
  SHORT
    ? "studio-masterclass-tutorial-thumbnail-short.png"
    : "studio-masterclass-tutorial-thumbnail.png",
);
const NARRATION_TXT = path.join(
  OUT_DIR,
  SHORT
    ? "studio-masterclass-tutorial-narration-short.txt"
    : "studio-masterclass-tutorial-narration.txt",
);
const SRT = path.join(OUT_DIR, `${STEM}.srt`);
const DEV_LOG = path.join(OUT_DIR, "studio-masterclass-dev.log");

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TITLE = SHORT
  ? {
      kicker: "S.M.U.V.E. Prime · Studio Masterclass",
      title: "Studio Masterclass, in one take",
      subtitle: "From shared link to first beat, explained.",
    }
  : {
      kicker: "S.M.U.V.E. Prime · Studio Masterclass",
      title: "Studio Masterclass, end to end",
      subtitle:
        "From shared link to first beat, explained in full.",
    };

const CAPTIONS = SHORT
  ? [
      "Shared link. Exact lesson. No maze.",
      "One tap. Quick Session. The room is live.",
      "Starter groove loaded. Study every layer.",
      "Lesson complete. Next lesson waiting.",
      "Build the beat. Idea to record.",
    ]
  : [
      "A shared link opens the exact lesson. No maze. No wasted motion.",
      "One tap into Quick Session. The room is live.",
      "Load the starter groove. Study every layer.",
      "Lesson complete. The next move is already waiting.",
      "Build the beat. That is how an idea becomes a record.",
    ];

const NARRATION = SHORT
  ? "S.M.U.V.E. Prime. Studio Masterclass. Shared link. Quick Session. Starter groove. Lesson complete. Next move: build the beat. That is how an idea becomes a record."
  : "S.M.U.V.E. Prime. Studio Masterclass. First Loop, end to end. This is the full pipeline, not a teaser. A shared lesson link opens the exact lesson. No maze. No wasted clicks. One tap drops you into Quick Session. The room is live. Load the starter groove. Study every layer. Then tear it open and make it yours. The auto-check fires when the groove is loaded. Lesson complete. The next lesson is already waiting. Build the beat. That is how an idea becomes a record. Total musical dominance.";

// The wide narration carries more words than the Short. Give each beat room
// to land instead of letting ffmpeg cut the voice off at the last frame.
const HOLD =
  Number.parseFloat(process.env.DEMO_HOLD || "") || (SHORT ? 1 : 1.5);

function prettyPath(file) {
  return path.relative(ROOT, file) || file;
}

function commandExists(command) {
  const finder = process.platform === "win32" ? "where" : "which";
  return (
    spawnSync(finder, [command], {
      stdio: "ignore",
      shell: process.platform === "win32",
    }).status === 0
  );
}

async function serverIsUp(url, timeoutMs = 1_500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/hub`, { redirect: "manual" });
      if (response.ok) return true;
    } catch {
      /* keep waiting */
    }
    await sleep(250);
  }
  return false;
}

async function waitForServer(url, timeoutMs = 120_000) {
  if (await serverIsUp(url, timeoutMs)) return;
  throw new Error(`Dev server did not become reachable at ${url}/hub`);
}

function startServer() {
  const log = fs.createWriteStream(DEV_LOG, { flags: "w" });
  const child = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  return child;
}

function stopServer(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function makeSession() {
  const user = {
    id: "user_e2e_exec",
    email: "e2e@smuve.test",
    artistName: "Executive Artist",
    role: "Artist",
    permissions: ["STANDARD"],
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLogin: "2026-01-01T00:00:00.000Z",
    profileCompleteness: 100,
  };
  const salt = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
  return Buffer.from(`${JSON.stringify(user)}|${salt}`).toString("base64");
}

async function showCaption(page, step, text) {
  await page.evaluate(
    ({ stepText, copy, compact }) => {
      let node = document.getElementById("demo-caption");
      if (!node) {
        node = document.createElement("div");
        node.id = "demo-caption";
        document.body.appendChild(node);
      }
      node.style.cssText = compact
        ? "position:fixed;left:12px;right:12px;top:84px;z-index:2147483647;" +
          "padding:10px 12px;border-radius:10px;background:rgba(6,12,22,.94);" +
          "border:1px solid rgba(126,224,221,.45);color:#eaf0ff;" +
          "font:600 12px/1.4 'Public Sans',system-ui,sans-serif;" +
          "box-shadow:0 12px 30px rgba(0,0,0,.5);pointer-events:none"
        : "position:fixed;left:24px;bottom:24px;z-index:2147483647;" +
          "max-width:560px;padding:14px 18px;border-radius:14px;" +
          "background:rgba(6,12,22,.94);border:1px solid rgba(126,224,221,.45);" +
          "color:#eaf0ff;font:600 15px/1.45 'Public Sans',system-ui,sans-serif;" +
          "box-shadow:0 16px 40px rgba(0,0,0,.5);pointer-events:none";
      node.innerHTML =
        `<span style="display:block;color:#7ee0dd;font-size:10px;` +
        `letter-spacing:.12em;text-transform:uppercase;margin-bottom:3px">` +
        `STEP ${stepText} OF 5</span>${copy}`;
    },
    { stepText: step, copy: text, compact: SHORT },
  );
}

async function showTitle(page, kicker, title, subtitle) {
  await page.evaluate(
    ({ kickerText, titleText, subtitleText, compact }) => {
      let node = document.getElementById("demo-title");
      if (!node) {
        node = document.createElement("div");
        node.id = "demo-title";
        node.style.cssText =
          "position:fixed;inset:0;z-index:2147483647;display:grid;" +
          "place-items:center;text-align:center;pointer-events:none;" +
          "background:radial-gradient(circle at 50% 45%,#13273a 0%,#05090f 70%);" +
          "color:#fff;font-family:'Public Sans',system-ui,sans-serif;" +
          `padding:${compact ? "24px" : "48px"}`;
        document.body.appendChild(node);
      }
      node.innerHTML =
        `<div><p style="margin:0 0 12px;color:#7ee0dd;font-size:${compact ? "9px" : "11px"};` +
        `font-weight:800;letter-spacing:.18em;text-transform:uppercase">` +
        `${kickerText}</p><h1 style="margin:0 auto;max-width:${compact ? "480px" : "820px"};` +
        `font-size:${compact ? "40px" : "52px"};line-height:1.05;letter-spacing:-.04em">${titleText}</h1>` +
        `<p style="margin:18px auto 0;max-width:${compact ? "430px" : "620px"};color:#aab4ca;` +
        `font-size:${compact ? "15px" : "18px"};line-height:1.5">${subtitleText}</p></div>`;
      node.style.display = "grid";
    },
    {
      kickerText: kicker,
      titleText: title,
      subtitleText: subtitle,
      compact: SHORT,
    },
  );
}

async function hideTitle(page) {
  await page.evaluate(() => {
    const node = document.getElementById("demo-title");
    if (node) node.style.display = "none";
  });
}

function srtTime(seconds) {
  const total = Math.max(0, Math.round(seconds * 1000));
  const milliseconds = total % 1000;
  const wholeSeconds = Math.floor(total / 1000);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(remainingSeconds).padStart(2, "0")},${String(
      milliseconds,
    ).padStart(3, "0")}`,
  ].join(":");
}

function writeShortSrt(cueStarts, finalTitleAt) {
  if (!SHORT) return null;
  const starts = cueStarts.filter((value) => Number.isFinite(value));
  if (starts.length === 0) return null;

  const lastStart = starts[starts.length - 1];
  const end = Math.max(
    lastStart + 1,
    Number.isFinite(finalTitleAt) ? finalTitleAt : lastStart + 2.6,
  );
  const cues = CAPTIONS.map((text, index) => {
    const start = starts[index] ?? index * (end / CAPTIONS.length);
    const next = starts[index + 1] ?? end;
    return {
      start,
      end: Math.max(start + 0.9, next - 0.12),
    };
  });
  const body = cues
    .map(
      (cue, index) =>
        `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${CAPTIONS[index]}\n`,
    )
    .join("\n");

  fs.writeFileSync(SRT, body, "utf8");
  console.log(`Captions: ${prettyPath(SRT)}`);
  return SRT;
}

function thumbnailHtml() {
  const steps = [
    ["01", "SHARED LINK"],
    ["02", "QUICK SESSION"],
    ["03", "STARTER GROOVE"],
    ["04", "NEXT LESSON"],
  ];
  const stepMarkup = steps
    .map(
      ([number, label], index) =>
        `<span class="step"><b>${number}</b>${label}</span>` +
        (index < steps.length - 1 ? `<i>→</i>` : ""),
    )
    .join("");
  const bars = Array.from({ length: 24 }, (_, index) => {
    const height = 22 + ((index * 37) % 116);
    return `<span style="height:${height}px"></span>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  body {
    background: #05090f;
    color: #fff;
    font-family: "Public Sans", "Arial Black", system-ui, sans-serif;
  }
  .frame {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    padding: ${SHORT ? "58px 52px 48px" : "54px 64px 44px"};
    background:
      radial-gradient(circle at 86% 18%, rgba(93,196,194,.19), transparent 28%),
      radial-gradient(circle at 8% 92%, rgba(175,37,244,.17), transparent 34%),
      linear-gradient(145deg, #08111d 0%, #05090f 58%, #0b0c16 100%);
  }
  .grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(126,224,221,.075) 1px, transparent 1px),
      linear-gradient(90deg, rgba(126,224,221,.075) 1px, transparent 1px);
    background-size: ${SHORT ? "68px 68px" : "64px 64px"};
    mask-image: linear-gradient(180deg, #000 0%, transparent 78%);
    pointer-events: none;
  }
  .frame::before {
    content: "";
    position: absolute;
    top: 0; left: 0; bottom: 0;
    width: 7px;
    background: linear-gradient(180deg, #7ee0dd, #ffb800 58%, #af25f4);
  }
  .top, .hero, .bottom { position: relative; z-index: 1; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 900; letter-spacing: .13em; }
  .sigil {
    display: grid; place-items: center;
    width: 38px; height: 38px;
    color: #05090f;
    font-size: 20px; font-weight: 900;
    background: linear-gradient(135deg, #7ee0dd, #5dc4c2);
    border-radius: 10px;
    box-shadow: 0 8px 26px rgba(93,196,194,.28);
  }
  .tag {
    color: #ffcf57;
    font-size: 10px; font-weight: 800; letter-spacing: .24em; text-transform: uppercase;
    text-align: right;
  }
  .hero {
    display: grid;
    grid-template-columns: ${SHORT ? "1fr" : "1.2fr .8fr"};
    align-items: center;
    gap: ${SHORT ? "34px" : "44px"};
    height: calc(100% - 150px);
    padding: ${SHORT ? "56px 0 0" : "0"};
  }
  .eyebrow {
    margin: 0 0 18px;
    color: #ffb800;
    font-size: ${SHORT ? "12px" : "13px"}; font-weight: 800; letter-spacing: .2em; text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-size: ${SHORT ? "clamp(92px, 12vw, 132px)" : "clamp(118px, 12.5vw, 164px)"};
    line-height: .84;
    letter-spacing: -.075em;
    font-weight: 900;
    text-transform: uppercase;
  }
  h1 em {
    display: block;
    color: transparent;
    font-style: normal;
    background: linear-gradient(110deg, #d7fffc 0%, #7ee0dd 44%, #5dc4c2 72%, #ffb800 100%);
    -webkit-background-clip: text;
    background-clip: text;
  }
  .lede {
    max-width: ${SHORT ? "440px" : "470px"};
    margin: ${SHORT ? "22px 0 0" : "26px 0 0"};
    color: #aab4ca;
    font-size: ${SHORT ? "18px" : "21px"}; line-height: 1.4; letter-spacing: -.01em;
  }
  .rule {
    display: flex; align-items: center; gap: 10px;
    margin-top: ${SHORT ? "26px" : "30px"};
    color: #7ee0dd;
    font-size: 9px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase;
  }
  .rule span { width: 38px; height: 2px; background: #ffb800; }
  .visual {
    position: relative;
    display: grid;
    place-items: center;
    min-height: ${SHORT ? "410px" : "420px"};
  }
  .ring, .ring::before, .ring::after {
    position: absolute; border-radius: 50%; content: "";
  }
  .ring {
    width: ${SHORT ? "360px" : "390px"};
    height: ${SHORT ? "360px" : "390px"};
    border: 1px solid rgba(126,224,221,.28);
    box-shadow: 0 0 80px rgba(93,196,194,.09) inset;
  }
  .ring::before { inset: 26px; border: 1px dashed rgba(255,184,0,.34); animation: spin 30s linear infinite; }
  .ring::after { inset: 64px; border: 1px solid rgba(175,37,244,.28); }
  @keyframes spin { to { transform: rotate(360deg); } }
  .orb {
    position: relative; z-index: 1;
    display: grid; place-items: center;
    width: ${SHORT ? "250px" : "270px"};
    height: ${SHORT ? "250px" : "270px"};
    background: radial-gradient(circle at 38% 28%, rgba(126,224,221,.22), rgba(8,17,29,.96) 62%);
    border: 1px solid rgba(126,224,221,.48);
    border-radius: 50%;
    box-shadow: 0 24px 80px rgba(0,0,0,.55), 0 0 60px rgba(93,196,194,.1);
  }
  .num {
    color: #fff;
    font-size: ${SHORT ? "104px" : "112px"};
    font-weight: 900; letter-spacing: -.08em; line-height: 1;
  }
  .num small { color: #ffb800; font-size: 30px; letter-spacing: 0; vertical-align: top; }
  .wave {
    position: absolute; bottom: 54px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 3px; height: 44px;
  }
  .wave span { display: block; width: 4px; border-radius: 3px; background: linear-gradient(180deg,#7ee0dd,#af25f4); opacity: .9; }
  .visual-label {
    position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
    margin: 0; color: #728096; font-size: 9px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; white-space: nowrap;
  }
  .bottom {
    position: absolute; left: 64px; right: 64px; bottom: 44px;
    display: flex; align-items: center; justify-content: space-between; gap: 22px;
    padding-top: 18px; border-top: 1px solid rgba(255,255,255,.13);
  }
  .steps { display: flex; align-items: center; gap: ${SHORT ? "10px" : "15px"}; flex-wrap: wrap; }
  .step { color: #8c99ad; font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
  .step b { color: #7ee0dd; margin-right: 5px; }
  .steps i { color: #ffb800; font-style: normal; font-size: 12px; }
  .seal { color: #ffcf57; font-size: 10px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; white-space: nowrap; }
  .short .hero { height: auto; }
  .short .visual { margin-top: 8px; }
  .short .bottom { left: 52px; right: 52px; bottom: 48px; }
  .short .steps { max-width: 540px; }
  @media (max-width: 600px) {
    .bottom { left: 32px; right: 32px; }
    .short .bottom { left: 32px; right: 32px; }
  }
</style>
</head>
<body class="${SHORT ? "short" : "wide"}">
  <div class="frame">
    <div class="grid"></div>
    <div class="top">
      <div class="brand"><span class="sigil">S</span> S.M.U.V.E. PRIME</div>
      <div class="tag">STUDIO MASTERCLASS<br />${SHORT ? "SHORT / 01" : "FIRST LOOP / 01"}</div>
    </div>
    <div class="hero">
      <div class="copy">
        <p class="eyebrow">FIRST LOOP · END TO END</p>
        <h1>First<em>Loop</em></h1>
        <p class="lede">From a shared link to your first beat.</p>
        <div class="rule"><span></span> One link. One groove. The next move.</div>
      </div>
      <div class="visual">
        <div class="ring"></div>
        <div class="orb">
          <div class="num">01<small>.</small></div>
          <div class="wave">${bars}</div>
        </div>
        <p class="visual-label">S.M.U.V.E. PRIME / MASTERCLASS</p>
      </div>
    </div>
    <div class="bottom">
      <div class="steps">${stepMarkup}</div>
      <div class="seal">TOTAL MUSICAL DOMINANCE</div>
    </div>
  </div>
</body>
</html>`;
}

async function renderThumbnail(browser) {
  const context = await browser.newContext({ viewport: THUMB_VIEWPORT });
  try {
    const page = await context.newPage();
    await page.setContent(thumbnailHtml(), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: THUMBNAIL, animations: "disabled" });
    console.log(`Thumbnail: ${prettyPath(THUMBNAIL)}`);
    return THUMBNAIL;
  } finally {
    await context.close();
  }
}

function findTts() {
  const override = process.env.NARRATION_AUDIO;
  if (override) {
    const file = path.resolve(override);
    if (fs.existsSync(file)) return { file, command: null };
    console.warn(`NARRATION_AUDIO not found: ${file}; trying local TTS.`);
  }

  const engines = [
    {
      command: "espeak-ng",
      extension: "wav",
      args: (file) => ["-w", file, "-s", "165", "-v", "en-us", NARRATION],
    },
    {
      command: "espeak",
      extension: "wav",
      args: (file) => ["-w", file, "-s", "165", NARRATION],
    },
    {
      command: "say",
      extension: "aiff",
      args: (file) => ["-o", file, NARRATION],
    },
    {
      command: "pico2wave",
      extension: "wav",
      args: (file) => ["-w", file, NARRATION],
    },
    {
      command: "flite",
      extension: "wav",
      args: (file) => ["-t", NARRATION, "-o", file],
    },
  ];

  for (const engine of engines) {
    if (!commandExists(engine.command)) continue;
    const file = path.join(
      OUT_DIR,
      `studio-masterclass-narration.${engine.extension}`,
    );
    const result = spawnSync(engine.command, engine.args(file), {
      encoding: "utf8",
    });
    if (result.status === 0 && fs.existsSync(file) && fs.statSync(file).size) {
      return { file, command: engine.command };
    }
    console.warn(
      `${engine.command} could not render narration: ${
        result.stderr || result.error?.message || "unknown error"
      }`,
    );
  }

  return { file: null, command: null };
}

function makeNarration() {
  fs.writeFileSync(NARRATION_TXT, `${NARRATION}\n`, "utf8");
  console.log(`Narration script: ${prettyPath(NARRATION_TXT)}`);

  if (process.env.PRIME_VOICE_ROTATION === "1") {
    const rotated = path.join(
      OUT_DIR,
      SHORT
        ? "studio-masterclass-narration-rotated-short.mp3"
        : "studio-masterclass-narration-rotated.mp3",
    );
    const rotation = spawnSync(
      process.execPath,
      [
        path.join(ROOT, "scripts", "prime-voice-rotation.mjs"),
        "--text-file",
        NARRATION_TXT,
        "--out",
        rotated,
      ],
      { cwd: ROOT, env: process.env, stdio: "inherit" },
    );
    if (
      rotation.status === 0 &&
      fs.existsSync(rotated) &&
      fs.statSync(rotated).size
    ) {
      console.log(
        `Narration audio: ${prettyPath(rotated)} (Prime voice rotation)`,
      );
      return rotated;
    }
    console.warn(
      "Prime voice rotation failed; falling back to the supplied or local narrator.",
    );
  }

  const narration = findTts();
  if (!narration.file) {
    console.warn(
      "No narration audio generated. Set NARRATION_AUDIO or install espeak-ng/say to mux a voice track.",
    );
    return null;
  }
  console.log(
    `Narration audio: ${prettyPath(narration.file)}${
      narration.command ? ` (${narration.command})` : " (supplied)"
    }`,
  );
  return narration.file;
}

function renderMedia(webm, narration, srt) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const available = spawnSync(ffmpeg, ["-version"], { stdio: "ignore" });
  if (available.status !== 0) {
    console.warn(
      "ffmpeg not found; leaving the WebM as-is. Install ffmpeg for MP4 and narration muxing.",
    );
    if (narration) {
      console.warn(
        "The WebM has no narration track; the voiceover file is separate.",
      );
    }
    return { file: webm, hasNarration: false, hasCaptions: false };
  }

  const relativeSrt = srt ? path.relative(ROOT, srt).replace(/\\/g, "/") : null;
  const captionStyle =
    "FontName=DejaVu Sans,FontSize=8,PrimaryColour=&H00FFFFFF," +
    "OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1," +
    "Alignment=2,MarginV=8,Bold=1";

  const buildArgs = (withCaptions) => {
    const args = ["-y", "-i", webm];
    if (narration) args.push("-i", narration);
    args.push("-map", "0:v:0");
    if (narration) args.push("-map", "1:a:0");

    const filters = [];
    if (SHORT) filters.push("scale=1080:1920:flags=lanczos");
    if (withCaptions && relativeSrt) {
      const escapedSrt = relativeSrt.replace(/'/g, "\\'");
      filters.push(
        `subtitles=filename='${escapedSrt}':force_style='${captionStyle}'`,
      );
    }
    if (filters.length) args.push("-vf", filters.join(","));

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "20",
    );
    if (narration) {
      args.push("-c:a", "aac", "-b:a", "160k", "-af", "apad", "-shortest");
    }
    args.push("-movflags", "+faststart", MP4);
    return args;
  };

  let withCaptions = Boolean(SHORT && srt && fs.existsSync(srt));
  let converted = spawnSync(ffmpeg, buildArgs(withCaptions), {
    stdio: "inherit",
  });
  if (converted.status !== 0 && withCaptions) {
    console.warn(
      "Caption burn-in failed; rendering the cut without burned captions.",
    );
    withCaptions = false;
    converted = spawnSync(ffmpeg, buildArgs(false), { stdio: "inherit" });
  }

  if (converted.status === 0 && fs.existsSync(MP4)) {
    console.log(
      `Video: ${prettyPath(MP4)}${narration ? " (with narration)" : ""}${
        withCaptions ? " + burned captions" : ""
      }`,
    );
    return {
      file: MP4,
      hasNarration: Boolean(narration),
      hasCaptions: withCaptions,
    };
  }

  console.warn("MP4 render failed; leaving the WebM as-is.");
  return { file: webm, hasNarration: false, hasCaptions: false };
}

async function getYouTubeAccessToken() {
  if (process.env.YOUTUBE_ACCESS_TOKEN) return process.env.YOUTUBE_ACCESS_TOKEN;

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error(
      result.error_description || result.error || "YouTube OAuth failed.",
    );
  }
  return result.access_token;
}

async function uploadToYouTube(file, thumbnail) {
  if (process.env.YOUTUBE_UPLOAD !== "1") {
    console.log(
      "YouTube upload skipped. Set YOUTUBE_UPLOAD=1 and OAuth credentials when ready.",
    );
    return null;
  }

  const accessToken = await getYouTubeAccessToken();
  if (!accessToken) {
    console.warn(
      "YouTube upload skipped: set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN (or YOUTUBE_ACCESS_TOKEN).",
    );
    return null;
  }

  const mime = file.endsWith(".mp4") ? "video/mp4" : "video/webm";
  const size = fs.statSync(file).size;
  const privacy = ["private", "unlisted", "public"].includes(
    process.env.YOUTUBE_PRIVACY,
  )
    ? process.env.YOUTUBE_PRIVACY
    : "unlisted";
  const title =
    process.env.YOUTUBE_TITLE ||
    (SHORT
      ? "First Loop in one take | S.M.U.V.E. Studio Masterclass #Shorts"
      : "S.M.U.V.E. Studio Masterclass — First Loop, end to end");
  const description =
    process.env.YOUTUBE_DESCRIPTION ||
    [
      "S.M.U.V.E. Prime walks the First Loop end to end:",
      "shared lesson link → Quick Session → starter groove → completion → Build the beat.",
      "",
      "Studio Masterclass in S.M.U.V.E. 2.0.",
      SHORT ? "#Shorts" : "",
      "#SMUVE #StudioMasterclass #MusicProduction",
    ]
      .filter(Boolean)
      .join("\n");

  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mime,
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify({
        snippet: {
          title: title.slice(0, 100),
          description: description.slice(0, 5000),
          tags: [
            "S.M.U.V.E.",
            "Studio Masterclass",
            "First Loop",
            "music production",
            "beat making",
          ],
          categoryId: "10",
        },
        status: {
          privacyStatus: privacy,
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );
  const initText = await init.text();
  if (!init.ok) {
    throw new Error(`YouTube upload init failed (${init.status}): ${initText}`);
  }
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl)
    throw new Error("YouTube did not return a resumable upload URL.");

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mime,
      "Content-Length": String(size),
    },
    body: fs.readFileSync(file),
  });
  const uploaded = await upload.json().catch(() => ({}));
  if (!upload.ok || !uploaded.id) {
    throw new Error(
      `YouTube upload failed (${upload.status}): ${
        uploaded.error?.message || "no video id returned"
      }`,
    );
  }

  if (thumbnail && fs.existsSync(thumbnail)) {
    const thumb = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(
        uploaded.id,
      )}&uploadType=media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "image/png",
        },
        body: fs.readFileSync(thumbnail),
      },
    );
    if (!thumb.ok) {
      console.warn(
        `Video uploaded, but the custom thumbnail was rejected (${thumb.status}).`,
      );
    }
  }

  console.log(`YouTube: https://youtu.be/${uploaded.id} (${privacy})`);
  return uploaded.id;
}

async function recordWalkthrough(browser) {
  const recordingStartedAt = Date.now();
  const cueStarts = [];
  let finalTitleAt = null;
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();
  const video = page.video();

  try {
    await page.addInitScript(
      ({ session }) => {
        try {
          sessionStorage.setItem("smuve_auth_session", session);
          localStorage.removeItem("smuve.studio.guide.progress.v1");
          localStorage.setItem("smuve_music_map_seen", "1");
        } catch {
          /* storage can be unavailable on an opaque document */
        }
      },
      { session: makeSession() },
    );
    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      }),
    );

    const guide = page.locator("app-studio-guide");
    const celebration = page.locator("app-guide-completion");

    // 1. Shared deep link.
    await page.goto("/studio?guide=first-loop&lesson=loop-sound", {
      waitUntil: "domcontentloaded",
    });
    await guide.waitFor({ state: "visible", timeout: 45_000 });
    await showTitle(page, TITLE.kicker, TITLE.title, TITLE.subtitle);
    await sleep(2_800 * HOLD);
    await hideTitle(page);
    await showCaption(page, 1, CAPTIONS[0]);
    cueStarts.push((Date.now() - recordingStartedAt) / 1000);
    await sleep(2_000 * HOLD);

    // 2. Open Quick Session.
    await guide
      .getByRole("button", { name: "Open Quick Session", exact: true })
      .click();
    await page.locator(".qs-shell").waitFor({ state: "visible" });
    await showCaption(page, 2, CAPTIONS[1]);
    cueStarts.push((Date.now() - recordingStartedAt) / 1000);
    await sleep(2_400 * HOLD);

    // 3. Starter groove and auto-check.
    await page.goto("/studio?guide=first-loop&lesson=loop-groove", {
      waitUntil: "domcontentloaded",
    });
    await guide.waitFor({ state: "visible", timeout: 45_000 });
    await showCaption(page, 3, CAPTIONS[2]);
    cueStarts.push((Date.now() - recordingStartedAt) / 1000);
    await sleep(2_000 * HOLD);
    await guide
      .getByRole("button", { name: "Load a starter groove", exact: true })
      .click();
    await celebration.waitFor({ state: "visible", timeout: 30_000 });
    await showCaption(page, 4, CAPTIONS[3]);
    cueStarts.push((Date.now() - recordingStartedAt) / 1000);
    await sleep(3_000 * HOLD);

    // 4. Next lesson.
    await celebration
      .getByRole("button", { name: "Next lesson", exact: true })
      .click();
    await page.waitForURL(/lesson=loop-drums/, { timeout: 30_000 });
    await guide.waitFor({ state: "visible", timeout: 30_000 });
    await showCaption(page, 5, CAPTIONS[4]);
    cueStarts.push((Date.now() - recordingStartedAt) / 1000);
    await sleep(2_600 * HOLD);
    finalTitleAt = (Date.now() - recordingStartedAt) / 1000;
    await showTitle(
      page,
      "Studio Masterclass",
      "Start with a groove.",
      "Then make it yours. I am watching.",
    );
    await sleep(2_600 * HOLD);
  } finally {
    await context.close();
  }

  if (!video) throw new Error("Playwright did not create a video recording.");
  const rawPath = await video.path();
  fs.copyFileSync(rawPath, WEBM);
  console.log(`WebM: ${prettyPath(WEBM)}`);
  return { webm: WEBM, cueStarts, finalTitleAt };
}

async function main() {
  const existingServer = await serverIsUp(BASE_URL);
  const server = existingServer ? null : startServer();
  let browser;

  try {
    if (!existingServer) await waitForServer(BASE_URL);

    browser = await chromium.launch({
      headless: process.env.DEMO_HEADLESS !== "0",
      slowMo: 140,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    let thumbnail = null;
    try {
      thumbnail = await renderThumbnail(browser);
    } catch (error) {
      console.warn(`Thumbnail render failed: ${error?.message || error}`);
    }

    const narration = makeNarration();
    const recording = await recordWalkthrough(browser);
    const srt = writeShortSrt(recording.cueStarts, recording.finalTitleAt);
    const media = renderMedia(recording.webm, narration, srt);
    const uploadedId = await uploadToYouTube(media.file, thumbnail);

    if (uploadedId) {
      console.log(`Published as ${SHORT ? "a Short" : "a video"}.`);
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) stopServer(server);
  }
}

if (process.env.DEMO_PRINT_THUMBNAIL === "1") {
  process.stdout.write(thumbnailHtml());
  process.exit(0);
}

if (process.env.DEMO_PRINT_NARRATION === "1") {
  process.stdout.write(`${NARRATION}\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`Demo recording failed: ${error?.message || error}`);
  if (String(error?.message || "").includes("shared libraries")) {
    console.error(
      "Install Chromium system dependencies, then retry: sudo npx playwright install-deps chromium",
    );
  } else if (
    String(error?.message || "").includes("Executable doesn't exist")
  ) {
    console.error(
      "Install the browser, then retry: npx playwright install chromium",
    );
  }
  process.exitCode = 1;
});
