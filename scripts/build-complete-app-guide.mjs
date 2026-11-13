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
const VOICE = process.env.GUIDE_VOICE || "en-US-JennyNeural";
const RATE = 44_100;
const LEAD = 0.24;
const GAP = 0.24;
const TAIL = 0.65;

const CHAPTERS = [
  {
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
    lines: [
      "This is S.M.U.V.E. 2.0, and this guide covers the complete application, not one isolated tool.",
      "The shell is the map. The sidebar groups every workspace into Core, Strategy, Creative, Community, Utility and Artist families.",
      "Pin the rooms you repeat, use recent workspaces to return, and press Control K when you already know the name.",
      "The top bar carries sync health, appearance, performance mode, the inbox and the assistant. Check it before you start a long session.",
    ],
  },
  {
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
    lines: [
      "Label Hub is the executive cockpit. It turns the whole system into the day in front of you.",
      "The command center surfaces release status, project state, career signals and the next moves worth considering.",
      "Use the related workspace rail to move from a signal into the room that can act on it.",
      "The Hub is where you decide what deserves the session. It is not where you do every job.",
    ],
  },
  {
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
    lines: [
      "Studio is one production shell with a dedicated surface for every stage of the record.",
      "Start in Quick Session or open the Masterclass, then build the arrangement in the timeline, channel rack and piano roll.",
      "Balance in the mixer, shape the tone in the effects rack, and use automation when the move has to change over time.",
      "Finish in the mastering suite and export a named master. The surface changes, but the project stays the same.",
    ],
  },
  {
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
    ],
    lines: [
      "The rhythm and performance tools cover programming, live launching and DJ work.",
      "Drum Machine and Piano Roll write the part, while the Sampler and Sound Pads turn the performance into a playable instrument.",
      "Performance mode launches scenes and clips; the DJ deck handles two tracks, hot cues, looping and the crossfade.",
      "Rehearse the actual launch order before you record it. A set that only works in arrangement view is not a live set yet.",
    ],
  },
  {
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
    lines: [
      "The creation side of the app starts before the Studio: Composition Core, AI Produce, Cowrite, Lyric Editor, Practice and the Music Academy.",
      "The Academy now covers instruments and vocals plus acting, directing, music business and legal, and marketing and promotion.",
      "Composition Core works inside a genre and can generate a full song, a beat or a single musical step.",
      "AI Produce takes a brief further, while Cowrite and Lyric Editor keep the human topline and the words in the room.",
      "Practice and Academy turn a weak spot into a routine. Use them between records, not only when a deadline is already late.",
    ],
  },
  {
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
    lines: [
      "The Image and Video Lab carries a release from cover art to a finished cut.",
      "Choose film, music video, social or broadcast before you ingest, because the mode sets the frame and delivery preset.",
      "Cut on the timeline, then add titles, the audio bed, the look and camera capture. Effects and keyframes are stored with the clip.",
      "Save a named project and export a master you have played back. Do not discover a raster or codec problem at delivery.",
    ],
  },
  {
    number: "07",
    screen: "07-spot.png",
    kicker: "Community",
    title: "Tha Spot: play and broadcast",
    subtitle: "Discovery, lobbies, squads and live",
    features: [
      "Catalogue, search and filters",
      "Rooms, lobbies and squads",
      "Challenges and split-screen",
      "TV, radio and Go Live",
    ],
    lines: [
      "Tha Spot is the community arcade. It combines discovery, social play and broadcasting.",
      "Filter the catalogue, search the library, then read the launch mode before opening a cabinet.",
      "Rooms and lobbies carry the session; squads, challenges, split-screen and spectator reactions carry the competition.",
      "When you are not playing, use S.M.U.V.E TV and Jeff Radio, or start a Go Live link and invite viewers into the cabinet.",
    ],
  },
  {
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
    lines: [
      "The strategy family turns profile evidence into a decision: Career Board, Intel Lab, Analytics, Artist Development and the coaching surfaces.",
      "Career Board tracks opportunities and momentum. Intel Lab frames the market question, and Analytics checks the signal.",
      "Adaptive Profile and Artist Coach read the committed identity; the Case File keeps the verdict and the open loops.",
      "Keep measured data separate from a recommendation. A projection is not a receipt.",
    ],
  },
  {
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
    lines: [
      "The business side starts with Projects and Release Pipeline, then moves into Business Suite and the Artist Toolkit.",
      "Projects hold the work and the delivery state. The pipeline makes each stage visible before launch.",
      "The Toolkit covers splits, royalty estimates and the rights checklist; Business Suite holds the legal and operational flows.",
      "Document ownership before delivery. Waiting until release week gives away the leverage you already earned.",
    ],
  },
  {
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
    lines: [
      "The AI layer is the assistant, the Command Center and the Neural Foundry, all reading the same profile and case file.",
      "Use the assistant for a specific decision, and use the command lanes to reach production, marketing or business without losing the thread.",
      "Voice Lab controls how it speaks. Full Control lets it act; Mimic borrows your register; the memory counter keeps the thread honest.",
      "Turn Full Control on for the task, read the receipt, then turn it off. Authority should be temporary and deliberate.",
    ],
  },
  {
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
    lines: [
      "The community and commerce surfaces connect collaboration, competition and selling.",
      "Remix Arena and Cowrite carry shared sessions. The Challenge Inbox keeps invitations and callouts from disappearing.",
      "Storefront and Products publish what you sell; the public artist page is the version a fan actually sees.",
      "Check permissions before you share a project, and check the store listing before you call it live.",
    ],
  },
  {
    number: "12",
    screen: "12-system.png",
    kicker: "System",
    title: "Profile, cloud and settings",
    subtitle: "Identity, history and security",
    features: [
      "Profile and Journey",
      "Cloud Vault and Timeline",
      "Sync Center and PWA",
      "Theme, performance and 2FA",
    ],
    lines: [
      "Profile, Journey, Cloud Vault, Session Timeline and Settings are the system layer under every workspace.",
      "Commit the profile so the assistant and the coaching surfaces read one identity, then use Journey and the adaptive views to see the arc.",
      "Cloud Vault and Session Timeline hold backups and history; Sync Center tells you whether the current work actually landed.",
      "Settings controls theme, HUD, performance mode and security. Test the recovery path before you need it.",
    ],
  },
  {
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
    lines: [
      "A complete release is one chain, not thirteen separate tools.",
      "Start with the profile and a named project. Write and produce the record, then finish the master and the visual.",
      "Move through the release pipeline, agree the splits, and prepare the assets each launch stage needs.",
      "Launch, measure the signal, record the verdict in the Case File, and let the next move come from evidence.",
    ],
  },
];

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

function synthesize(text, destination) {
  const result = spawnSync(
    "python3",
    [
      "-m",
      "edge_tts",
      "--voice",
      VOICE,
      "--rate=-4%",
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
  return (
    result.status === 0 &&
    existsSync(destination) &&
    statSync(destination).size > 2000
  );
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
for (const chapter of CHAPTERS) {
  for (let index = 0; index < chapter.lines.length; index += 1) {
    const key = `${chapter.number}-${index + 1}`;
    const text = chapter.lines[index];
    const mp3 = path.join(VOICE_DIR, `${key}.mp3`);
    const pcm = path.join(VOICE_DIR, `${key}.pcm`);
    if (plan[key]?.text !== text) {
      rmSync(mp3, { force: true });
      rmSync(pcm, { force: true });
      plan[key] = { text, voice: VOICE };
    }
    if (!existsSync(mp3) || statSync(mp3).size <= 2000) {
      console.log(`voice · ${key}`);
      if (!synthesize(text, mp3)) {
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
