#!/usr/bin/env node
/**
 * Build the complete S.M.U.V.E 2.0 application guide.
 *
 *   node scripts/build-complete-app-guide.mjs
 *
 * 13 real-surface chapters, one narrated line at a time, chapter cards and one
 * H.264/AAC master that ships at src/assets/learn/complete-app-guide.mp4.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCREENS = path.resolve("artifacts/complete-app-guide/screens");
const OUT = path.resolve("artifacts/complete-app-guide");
const WORK = path.join(OUT, "build");
const VOICE_DIR = path.join(WORK, "voice");
const CLIP_DIR = path.join(WORK, "clips");
const SLIDE_DIR = path.join(WORK, "slides");
const FFMPEG =
  process.env.FFMPEG_PATH ||
  "/tmp/smuve-media/node_modules/ffmpeg-static/ffmpeg";
const TTS_PATH = process.env.TTS_PATH || "/tmp/tts";
const SLIDE_PY = path.resolve("scripts/complete-app-guide-slide.py");
// The guide is read by S.M.U.V.E. itself, and the app's narrator shape-shifts
// sentence by sentence rather than reading in one flat voice. The video draws
// from the same mixed pool, seeded so a re-render keeps the same cast.
const VOICES = (
  process.env.GUIDE_VOICE_POOL ||
  [
    "en-US-AndrewMultilingualNeural",
    "en-US-GuyNeural",
    "en-US-BrianNeural",
    "en-GB-RyanNeural",
    "en-AU-WilliamNeural",
    "en-CA-LiamNeural",
    "en-IE-ConnorNeural",
    "en-US-JennyNeural",
    "en-US-AriaNeural",
    "en-US-EmmaNeural",
    "en-US-AvaNeural",
    "en-GB-SoniaNeural",
    "en-AU-NatashaNeural",
    "en-CA-ClaraNeural",
    "en-IE-EmilyNeural",
  ].join(",")
)
  .split(",")
  .map((voice) => voice.trim())
  .filter(Boolean);
const VOICE_SEED = Number(process.env.GUIDE_VOICE_SEED || 20261120);
const VOICE_RATE = process.env.GUIDE_VOICE_RATE || "-4%";
// Pitch drift keeps the persona restless without changing the voice itself.
const VOICE_PITCHES = ["-8Hz", "-4Hz", "+0Hz", "+4Hz", "+6Hz"];
const RATE = 44_100;
const LEAD = 0.24;
const GAP = 0.24;
const TAIL = 0.65;

// The render needs ffmpeg and edge-tts; say which one is missing and how to get
// it instead of dying on the first chapter with a bare spawn error.
if (!existsSync(FFMPEG)) {
  throw new Error(
    `ffmpeg not found at ${FFMPEG}. Set FFMPEG_PATH, or install it with:\n` +
      "  npm install --prefix /tmp/smuve-media ffmpeg-static"
  );
}
const ttsProbe = spawnSync("python3", ["-m", "edge_tts", "--version"], {
  encoding: "utf8",
  env: { ...process.env, PYTHONPATH: TTS_PATH },
});
if (ttsProbe.status !== 0) {
  throw new Error(
    `edge-tts is not importable (PYTHONPATH=${TTS_PATH}). Install it with:\n` +
      `  python3 -m pip install --target ${TTS_PATH} edge-tts`
  );
}

const NARRATION = JSON.parse(
  readFileSync(
    path.join(ROOT, "src/app/components/settings/complete-app-guide.narration.json"),
    "utf8"
  )
);

// One script for both surfaces: the MP4 speaks exactly what the in-app narrator
// reads, so no spoken line is ever written twice.
const CHAPTERS = [
  {
    id: "shell",
    number: "01",
    screen: "01-shell.png",
    kicker: "Orientation",
    title: "Start with the shell",
    subtitle: "One map for every workspace",
    features: [
      "Six workspace families",
      "Ctrl + K command palette",
      "Pinned and recent rooms",
      "Sync, appearance and assistant",
    ],
  },
  {
    id: "hub",
    number: "02",
    screen: "02-hub.png",
    kicker: "Command",
    title: "Run the day from Label Hub",
    subtitle: "Releases, projects and the next move",
    features: [
      "Release and project status",
      "Career and audience signals",
      "Recommended next moves",
      "Routes into every core room",
    ],
  },
  {
    id: "studio",
    number: "03",
    screen: "03-studio.png",
    kicker: "Production",
    title: "Studio: idea to master",
    subtitle: "Every stage in one production shell",
    features: [
      "Quick Session and Masterclass",
      "Arrangement, rack and piano roll",
      "Mixer, effects and automation",
      "Mastering, DJ and export",
    ],
  },
  {
    id: "rhythm",
    number: "04",
    screen: "04-performance.png",
    kicker: "Performance",
    title: "Rhythm, performance and decks",
    subtitle: "Program it, play it, launch it",
    features: [
      "Drum Machine and Piano Roll",
      "Sampler and Sound Pads",
      "Performance grid and scene launch",
      "Dual-deck DJ and hot cues",
      "3D live stage with drop-in performers",
    ],
  },
  {
    id: "create",
    number: "05",
    screen: "05-composer.png",
    kicker: "Creation",
    title: "Write, produce and learn",
    subtitle: "The idea before the session",
    features: [
      "Composition Core and AI Produce",
      "Cowrite and Lyric Editor",
      "Practice Space",
      "Music Academy programs",
      "Academy career paths: acting, directing, business, legal, marketing",
    ],
  },
  {
    id: "lab",
    number: "06",
    screen: "06-lab.png",
    kicker: "Visuals",
    title: "Image & Video Lab",
    subtitle: "Cover art to finished cut",
    features: [
      "Film, social and broadcast modes",
      "Timeline and frame nudging",
      "Titles, audio and FX keyframes",
      "Projects and master export",
    ],
  },
  {
    id: "spot",
    number: "07",
    screen: "07-spot.png",
    kicker: "Community",
    title: "Tha Spot: play, compete, broadcast",
    subtitle: "Discovery, lobbies, squads and live",
    features: [
      "Catalogue, search and filters",
      "Rooms, lobbies and squads",
      "Challenges and split-screen",
      "TV, radio and Go Live",
    ],
  },
  {
    id: "career",
    number: "08",
    screen: "08-career.png",
    kicker: "Strategy",
    title: "Career, strategy and evidence",
    subtitle: "Turn profile evidence into decisions",
    features: [
      "Career Board and momentum",
      "Intel Lab and Analytics",
      "Adaptive Profile and coaching",
      "Case File verdicts and loops",
    ],
  },
  {
    id: "business",
    number: "09",
    screen: "09-release.png",
    kicker: "Business",
    title: "Release, business and rights",
    subtitle: "From project to delivery",
    features: [
      "Projects and release stages",
      "Splits and royalty estimates",
      "Contracts and legal documents",
      "Knowledge Base and rights",
    ],
  },
  {
    id: "intelligence",
    number: "10",
    screen: "10-command.png",
    kicker: "Intelligence",
    title: "The AI command layer",
    subtitle: "Advice, voice and real actions",
    features: [
      "Assistant command lanes",
      "Command Center and decrees",
      "Neural Foundry tools",
      "Voice Lab and Full Control",
    ],
  },
  {
    id: "network",
    number: "11",
    screen: "11-community.png",
    kicker: "Network",
    title: "Community and commerce",
    subtitle: "Collaborate, compete and sell",
    features: [
      "Remix Arena and Cowrite",
      "Challenge Inbox",
      "Storefront and Products",
      "Public artist pages",
    ],
  },
  {
    id: "system",
    number: "12",
    screen: "12-system.png",
    kicker: "System",
    title: "Profile, cloud, timeline and settings",
    subtitle: "Identity, history and security",
    features: [
      "Profile and Journey",
      "Cloud Vault and Timeline",
      "Sync Center and PWA",
      "Theme, performance and 2FA",
    ],
  },
  {
    id: "workflow",
    number: "13",
    screen: "13-workflow.png",
    kicker: "Workflow",
    title: "One record, end to end",
    subtitle: "The handoffs that make a release",
    features: [
      "Profile and named project",
      "Production and visual",
      "Release, splits and launch",
      "Analytics and next move",
    ],
  },
].map((chapter) => {
  const narration = NARRATION[chapter.id];
  if (!narration) {
    throw new Error(`No shared narration for chapter ${chapter.id}`);
  }
  return {
    ...chapter,
    lines: [narration.intro, ...narration.features, narration.closing],
  };
});

const FALLBACKS = {
  "01-shell.png": "artifacts/chat-tutorial/screens/01-open.png",
  "02-hub.png": "artifacts/chat-tutorial/screens/01-open.png",
  "03-studio.png": "artifacts/studio-action-check/11-arrangement.png",
  "04-performance.png": "artifacts/studio-action-check/19-performance.png",
  "05-composer.png": "artifacts/studio-action-check/10-ai-producer.png",
  "06-lab.png": "artifacts/lab-tutorial/final-learn-overlay.png",
  "07-spot.png": "artifacts/tha-spot-video/stills/floor.png",
  "08-career.png": "artifacts/studio-desktop.png",
  "09-release.png": "artifacts/studio-desktop.png",
  "10-command.png": "artifacts/studio-desktop-assistant.png",
  "11-community.png": "artifacts/tha-spot-video/stills/squad.png",
  "12-system.png": "artifacts/studio-desktop.png",
  "13-workflow.png": "artifacts/studio-action-check/23-export.png",
};

for (const dir of [OUT, WORK, VOICE_DIR, CLIP_DIR, SLIDE_DIR]) {
  mkdirSync(dir, { recursive: true });
}
for (const dir of [CLIP_DIR, SLIDE_DIR]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${(result.stderr || "").slice(-1200)}`
    );
  }
  return result;
}

function hashStem(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The voice for one sentence: seeded by its stem so a re-render keeps the same
 * cast, drawn from the whole pool, and never the same voice twice in a row.
 */
function voiceFor(stem, previousVoice) {
  const random = mulberry32(hashStem(`${VOICE_SEED}:${stem}`));
  const pool = VOICES.filter((voice) => voice !== previousVoice);
  return {
    voice: pool[Math.floor(random() * pool.length)] ?? VOICES[0],
    pitch: VOICE_PITCHES[Math.floor(random() * VOICE_PITCHES.length)],
  };
}

function wait(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

/** One line in one voice, retried: the service occasionally returns no audio. */
function synthesize(text, destination, voice, pitch) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync(
      "python3",
      [
        "-m",
        "edge_tts",
        "--voice",
        voice,
        `--rate=${VOICE_RATE}`,
        `--pitch=${pitch}`,
        "--text",
        text,
        "--write-media",
        destination,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PYTHONPATH: TTS_PATH },
        maxBuffer: 16 * 1024 * 1024,
      }
    );
    if (
      result.status === 0 &&
      existsSync(destination) &&
      statSync(destination).size > 2000
    ) {
      return true;
    }
    const reason = (result.stderr || "").trim().split("\n").pop() || "no audio";
    console.warn(`tts retry ${attempt}/3 · ${voice} ${pitch} · ${reason}`);
    if (attempt < 3) wait(attempt * 2);
  }
  return false;
}

function resolveScreen(file) {
  const direct = path.join(SCREENS, file);
  if (existsSync(direct) && statSync(direct).size > 20_000) return direct;
  const fallback = path.resolve(FALLBACKS[file]);
  if (existsSync(fallback)) {
    console.warn(`screen fallback: ${file} -> ${fallback}`);
    return fallback;
  }
  throw new Error(`missing screen ${file} and no fallback`);
}

const planFile = path.join(WORK, "voice-plan.json");
let plan = {};
try {
  plan = JSON.parse(readFileSync(planFile, "utf8"));
} catch {
  plan = {};
}

const sentenceFiles = [];
let previousVoice;
for (const chapter of CHAPTERS) {
  for (let index = 0; index < chapter.lines.length; index += 1) {
    const key = `${chapter.number}-${index + 1}`;
    const text = chapter.lines[index];
    const { voice, pitch } = voiceFor(key, previousVoice);
    previousVoice = voice;
    const mp3 = path.join(VOICE_DIR, `${key}.mp3`);
    const pcm = path.join(VOICE_DIR, `${key}.pcm`);
    if (
      plan[key]?.text !== text ||
      plan[key]?.voice !== voice ||
      plan[key]?.pitch !== pitch
    ) {
      rmSync(mp3, { force: true });
      rmSync(pcm, { force: true });
      plan[key] = { text, voice, pitch };
    }
    if (!existsSync(mp3) || statSync(mp3).size <= 2000) {
      console.log(`voice · ${key} · ${voice} ${pitch}`);
      if (!synthesize(text, mp3, voice, pitch)) {
        throw new Error(`TTS failed for ${key}`);
      }
    }
    if (!existsSync(pcm) || statSync(pcm).mtimeMs < statSync(mp3).mtimeMs) {
      run(FFMPEG, [
        "-y",
        "-loglevel",
        "error",
        "-i",
        mp3,
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "-ar",
        String(RATE),
        "-ac",
        "1",
        pcm,
      ]);
    }
    sentenceFiles.push({ chapter: chapter.number, pcm });
  }
  writeFileSync(planFile, JSON.stringify(plan, null, 2));
}

const silence = (seconds) => Buffer.alloc(Math.round(RATE * 2 * seconds));
const chapterAudio = new Map();
for (const chapter of CHAPTERS) {
  const entries = sentenceFiles.filter((entry) => entry.chapter === chapter.number);
  const parts = [silence(LEAD)];
  for (const entry of entries) {
    parts.push(readFileSync(entry.pcm), silence(GAP));
  }
  parts.push(silence(TAIL - GAP));
  const raw = Buffer.concat(parts);
  const rawPath = path.join(VOICE_DIR, `${chapter.number}.raw`);
  const wavPath = path.join(VOICE_DIR, `${chapter.number}.wav`);
  writeFileSync(rawPath, raw);
  run(FFMPEG, [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "s16le",
    "-ar",
    String(RATE),
    "-ac",
    "1",
    "-i",
    rawPath,
    "-c:a",
    "pcm_s16le",
    wavPath,
  ]);
  chapterAudio.set(chapter.number, {
    wavPath,
    duration: raw.length / (RATE * 2),
  });
}

const receipts = [];
for (const chapter of CHAPTERS) {
  const source = resolveScreen(chapter.screen);
  const slide = path.join(SLIDE_DIR, `${chapter.number}.png`);
  run("python3", [
    SLIDE_PY,
    source,
    slide,
    chapter.number,
    chapter.kicker,
    chapter.title,
    chapter.subtitle,
    JSON.stringify(chapter.features),
    String(CHAPTERS.length),
  ]);
  const audio = chapterAudio.get(chapter.number);
  const clip = path.join(CLIP_DIR, `${chapter.number}.mp4`);
  run(FFMPEG, [
    "-y",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    slide,
    "-i",
    audio.wavPath,
    "-t",
    audio.duration.toFixed(3),
    "-vf",
    "scale=1280:720,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "21",
    "-tune",
    "stillimage",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    clip,
  ]);
  receipts.push({
    number: chapter.number,
    title: chapter.title,
    kicker: chapter.kicker,
    screen: chapter.screen,
    source,
    duration: audio.duration,
    clip,
  });
  console.log(
    `chapter ${chapter.number} · ${audio.duration.toFixed(1)}s · ${chapter.title}`
  );
}

const concatFile = path.join(WORK, "concat.txt");
writeFileSync(
  concatFile,
  receipts
    .map((chapter) => `file '${chapter.clip.replace(/'/g, "'\\''")}'`)
    .join("\n") + "\n"
);
const master = path.join(OUT, "complete-app-guide.mp4");
run(FFMPEG, [
  "-y",
  "-loglevel",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  concatFile,
  "-c",
  "copy",
  "-movflags",
  "+faststart",
  master,
]);

let start = 0;
const chapters = receipts.map((chapter) => {
  const entry = { ...chapter, start, end: start + chapter.duration };
  start += chapter.duration;
  delete entry.clip;
  return entry;
});
writeFileSync(
  path.join(OUT, "chapters.json"),
  JSON.stringify({ total: chapters.length, duration: start, chapters }, null, 2)
);
mkdirSync(path.join(ROOT, "src/assets/learn"), { recursive: true });
copyFileSync(master, path.join(ROOT, "src/assets/learn/complete-app-guide.mp4"));
console.log(`\nmaster: ${master}`);
console.log(`duration: ${(start / 60).toFixed(1)} min`);
console.log(`size: ${(statSync(master).size / 1024 / 1024).toFixed(1)} MB`);
