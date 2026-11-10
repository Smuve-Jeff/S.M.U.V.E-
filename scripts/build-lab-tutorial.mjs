#!/usr/bin/env node
/**
 * Build the Image & Video Lab "Cinema Academy" tutorial.
 *
 *   node scripts/build-lab-tutorial.mjs
 *
 * Nine real lab screenshots, 27 narration sentences in a mixed male/female
 * voice order with no adjacent repeat, burned chapter cards, and one H.264/AAC
 * master that ships
 * inside the component at src/assets/learn/.
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
const SCREENS = path.resolve("artifacts/lab-tutorial/screens");
const OUT = path.resolve("artifacts/lab-tutorial");
const WORK = path.join(OUT, "build");
const VOICE_DIR = path.join(WORK, "voice");
const CLIP_DIR = path.join(WORK, "clips");
const SLIDE_DIR = path.join(WORK, "slides");
const FFMPEG =
  process.env.FFMPEG_PATH ||
  "/tmp/smuve-media/node_modules/ffmpeg-static/ffmpeg";
const TTS_PATH = process.env.TTS_PATH || "/tmp/tts";
const SLIDE_PY = path.resolve("scripts/lab-tutorial-slide.py");
const RATE = 44_100;
const LEAD_SILENCE = 0.2;
const GAP_SILENCE = 0.24;
const TAIL_SILENCE = 0.7;

for (const dir of [OUT, WORK, VOICE_DIR, CLIP_DIR, SLIDE_DIR]) {
  mkdirSync(dir, { recursive: true });
}
for (const dir of [VOICE_DIR, CLIP_DIR, SLIDE_DIR]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

const CHAPTERS = [
  {
    number: "01",
    screen: "01-overview.png",
    kicker: "Setup",
    title: "The destination",
    subtitle: "Production mode, delivery preset and the master contract",
    lines: [
      "This is the Image and Video Lab, the cinema engine room inside S.M.U.V.E., and if you call it a preview toy I will fucking bury your project.",
      "Read the header before you touch a single clip: capture window, raster, frame rate, codec, export summary and watermark status are the contract for the master, so stop guessing like an amateur.",
      "The production mode sets the frame, runtime and preset. Choose the destination first, because a vertical social cut cannot be rescued by cropping the shit out of it at the end.",
    ],
  },
  {
    number: "02",
    screen: "03-ingest.png",
    panel: [1145, 430, 265, 360],
    kicker: "Media",
    title: "Ingest the picture",
    subtitle: "Neural Assets, still hold and honest metadata",
    lines: [
      "Footage enters through Neural Assets. Ingest opens a device picker for video and stills, while Synthesize builds a concept frame from your prompt instead of stealing one.",
      "Set the still hold before importing a photo. That number decides how long the image occupies the timeline, so you are not trimming some default bullshit you never chose.",
      "Wait for the poster and duration to land. If a take arrives rotated or short, fix it with a trim or stabilization instead of importing the same broken file again.",
    ],
  },
  {
    number: "03",
    screen: "04-timeline.png",
    kicker: "Edit",
    title: "Cut on the timeline",
    subtitle: "Select, seek, cut, nudge and mark",
    lines: [
      "The timeline is the source of truth, not your memory. Select a clip and the toolbar prints its start, duration and lane while the ruler owns the playhead.",
      "Cut, duplicate, delete or nudge by a single frame. Beat snap and markers keep music-driven edits honest instead of approximately rhythmic horseshit.",
      "Leave a frame of tail at the end of a clip. Transitions and audio fades need somewhere to resolve, and butted-up seams can go fuck themselves.",
    ],
  },
  {
    number: "04",
    screen: "05-titles.png",
    panel: [1145, 495, 265, 305],
    kicker: "Text",
    title: "Titles and captions",
    subtitle: "Overlays cut at the playhead, not painted on the monitor",
    lines: [
      "Titles are overlays, not paint. Type the title and subtitle, choose style, position and hold, then cut the card in at the playhead.",
      "Scrub across the hold and confirm it appears on the overlays lane only where you cut it. A title is not a global sticker, you lazy bastard.",
      "Captions live in the same discipline: type a cue, lift them from voiceover lines, or capture live speech, then check the timing before it embarrasses you.",
    ],
  },
  {
    number: "05",
    screen: "05b-audio.png",
    panel: [1145, 448, 265, 215],
    kicker: "Sound",
    title: "Score the master",
    subtitle: "The audio overlay is decoded onto the master bus",
    lines: [
      "Sound decides whether the picture feels expensive. Drop a music or voice bed into Audio Overlay; it is decoded onto the master bus, not some decorative side channel.",
      "Set the level and decide whether the bed loops. Then trim picture to the phrase instead of pushing every clip louder to fight the fucking music.",
      "Leave headroom. The export inherits this mix exactly, so fix the balance here rather than in another app after the damage is done.",
    ],
  },
  {
    number: "06",
    screen: "06-fx.png",
    panel: [1145, 195, 265, 385],
    kicker: "Look",
    title: "Shape the look",
    subtitle: "Filters, FX rack, motion and keyframes as clip data",
    lines: [
      "The look is clip data. Filters, transitions, camera moves, the FX rack, speed and keyframes all render the same in preview and export.",
      "Select the clip, stage a filter and transition, then dial the FX rack in small amounts. Grade the timeline only after the cut is locked, not before.",
      "Add one keyframe and scrub across it. One look, one motion and one animated property read as direction; five read as noisy shit.",
    ],
  },
  {
    number: "07",
    screen: "07-camera.png",
    kicker: "Capture",
    title: "Use the viewfinder",
    subtitle: "Camera takes, stills and the Capture Deck",
    lines: [
      "The camera surface is a real viewfinder. Switch the monitor to CAMERA, start the device, and check the frame and the light before recording anything.",
      "Grab a still or roll a take; captures land on the Capture Deck instead of disappearing into some downloads graveyard.",
      "Use the locate control to find a capture on the timeline. Recording is not a preview, so confirm the picture before committing a take that looks like shit.",
    ],
  },
  {
    number: "08",
    screen: "08-projects.png",
    kicker: "Projects",
    title: "Save work you can reopen",
    subtitle: "Explicit projects, busy state and resume",
    lines: [
      "Projects hold the timeline, media references and Director plans. Save as new, give it a name you will recognise, and wait for the busy state to clear.",
      "Reopen the project and prove the lanes, titles, audio and plan return behind the resume gate. That is the only save worth trusting, not a fucking autosave badge.",
      "Autosave is convenience, not a backup. Clearing browser storage removes local work, so save the project and keep the exported master.",
    ],
  },
  {
    number: "09",
    screen: "09-export.png",
    kicker: "Delivery",
    title: "Export a master",
    subtitle: "Window, raster, rate, codec and watermark",
    lines: [
      "Export records the program monitor for the chosen window. Capture length, raster, frame rate and codec are decisions, not defaults.",
      "Read the export summary and the watermark status, then start the render. Keep the tab in the foreground while the capture runs in real time.",
      "Wait for the download and play the file before delivery. A green button is not a finished master; a playable file is, and I will not fucking congratulate you for clicking it.",
    ],
  },
];

const VOICES = [
  { id: "en-US-GuyNeural", gender: "male" },
  { id: "en-US-DavisNeural", gender: "male" },
  { id: "en-US-JasonNeural", gender: "male" },
  { id: "en-US-TonyNeural", gender: "male" },
  { id: "en-US-AndrewNeural", gender: "male" },
  { id: "en-US-BrianNeural", gender: "male" },
  { id: "en-GB-RyanNeural", gender: "male" },
  { id: "en-AU-WilliamNeural", gender: "male" },
  { id: "en-CA-LiamNeural", gender: "male" },
  { id: "en-IE-ConnorNeural", gender: "male" },
  { id: "en-US-JennyNeural", gender: "female" },
  { id: "en-US-AriaNeural", gender: "female" },
  { id: "en-US-JaneNeural", gender: "female" },
  { id: "en-US-NancyNeural", gender: "female" },
  { id: "en-US-EmmaNeural", gender: "female" },
  { id: "en-US-AvaNeural", gender: "female" },
  { id: "en-GB-SoniaNeural", gender: "female" },
  { id: "en-AU-NatashaNeural", gender: "female" },
  { id: "en-CA-ClaraNeural", gender: "female" },
  { id: "en-IE-EmilyNeural", gender: "female" },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${(result.stderr || "").slice(-900)}`,
    );
  }
  return result;
}

function synthesize(text, voice, destination) {
  const result = spawnSync(
    "python3",
    ["-m", "edge_tts", "--voice", voice, "--text", text, "--write-media", destination],
    {
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: TTS_PATH },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return result.status === 0 && existsSync(destination) && statSync(destination).size > 2000;
}

/*
 * Voice order is deliberately NOT male/female alternation. A random voice is
 * drawn from the combined pool for every sentence, with only one hard rule:
 * the same voice never speaks twice in a row. Gender is therefore mixed at
 * random (M, F, F, M, F, M… or any other order), not a predictable switch.
 *
 * The chosen plan is written before synthesis so a retry reuses completed
 * sentences instead of burning another few minutes of TTS.
 */
const planFile = path.join(WORK, "voice-plan.json");
let plan = {};
try {
  plan = JSON.parse(readFileSync(planFile, "utf8"));
} catch {
  plan = {};
}
const expected = CHAPTERS.flatMap((chapter) =>
  chapter.lines.map((text, index) => ({
    stem: `${chapter.number}-${index + 1}`,
    text,
  })),
);
const planValid =
  Object.keys(plan).length > 0 &&
  expected.every((item) => plan[item.stem]?.text === item.text);
if (!planValid) {
  rmSync(VOICE_DIR, { recursive: true, force: true });
  mkdirSync(VOICE_DIR, { recursive: true });
  plan = {};
  let previousVoice = null;
  for (const item of expected) {
    const candidates = VOICES.filter((voice) => voice.id !== previousVoice);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    plan[item.stem] = {
      text: item.text,
      voice: chosen.id,
      gender: chosen.gender,
    };
    previousVoice = chosen.id;
  }
  writeFileSync(planFile, JSON.stringify(plan, null, 2));
}

const voiceLog = [];
const sentenceFiles = [];
let lastSpokenVoice = null;
console.log(`Synthesizing ${expected.length} narration sentences in a random voice order…`);
for (const chapter of CHAPTERS) {
  for (let index = 0; index < chapter.lines.length; index += 1) {
    const stem = `${chapter.number}-${index + 1}`;
    const entry = plan[stem];
    let voice = entry.voice;
    let speaker = entry.gender;
    const mp3 = path.join(VOICE_DIR, `${stem}.mp3`);
    const pcm = path.join(VOICE_DIR, `${stem}.pcm`);

    if (!existsSync(mp3) || statSync(mp3).size <= 2000) {
      if (!synthesize(chapter.lines[index], voice, mp3)) {
        // The fallback must also obey the no-repeat rule.
        const fallback =
          lastSpokenVoice === "en-US-GuyNeural"
            ? "en-US-JennyNeural"
            : "en-US-GuyNeural";
        console.warn(`voice fallback: ${voice} -> ${fallback}`);
        voice = fallback;
        speaker = fallback === "en-US-JennyNeural" ? "female" : "male";
        if (!synthesize(chapter.lines[index], voice, mp3)) {
          throw new Error(`TTS failed for chapter ${stem}`);
        }
        entry.voice = voice;
        entry.gender = speaker;
      }
    }

    const needsPcm =
      !existsSync(pcm) || statSync(pcm).mtimeMs < statSync(mp3).mtimeMs;
    if (needsPcm) {
      run(FFMPEG, [
        "-y", "-loglevel", "error", "-i", mp3,
        "-f", "s16le", "-acodec", "pcm_s16le",
        "-ar", String(RATE), "-ac", "1", pcm,
      ]);
    }

    lastSpokenVoice = voice;
    voiceLog.push({ chapter: chapter.number, sentence: index + 1, voice, speaker });
    sentenceFiles.push({
      chapter: chapter.number,
      pcm,
      voice,
      speaker,
      text: chapter.lines[index],
    });
  }
  // Persist fallbacks as they land, so a retry does not re-fail the same voice.
  writeFileSync(planFile, JSON.stringify(plan, null, 2));
}

const silence = (seconds) => Buffer.alloc(Math.round(RATE * 2 * seconds));
const chapterAudio = new Map();
for (const chapter of CHAPTERS) {
  const entries = sentenceFiles.filter((entry) => entry.chapter === chapter.number);
  const parts = [silence(LEAD_SILENCE)];
  for (const entry of entries) {
    parts.push(readFileSync(entry.pcm), silence(GAP_SILENCE));
  }
  parts.push(silence(TAIL_SILENCE - GAP_SILENCE));
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
  chapterAudio.set(chapter.number, { wavPath, duration: raw.length / (RATE * 2) });
}

const chapterReceipts = [];
for (const chapter of CHAPTERS) {
  const source = path.join(SCREENS, chapter.screen);
  if (!existsSync(source)) throw new Error(`missing screen ${source}`);
  const slide = path.join(SLIDE_DIR, `${chapter.number}.png`);
  run("python3", [
    SLIDE_PY,
    source,
    slide,
    chapter.number,
    chapter.kicker,
    chapter.title,
    chapter.subtitle,
    ...(chapter.panel ? chapter.panel.map(String) : []),
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
    "20",
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
  chapterReceipts.push({
    number: chapter.number,
    title: chapter.title,
    subtitle: chapter.subtitle,
    kicker: chapter.kicker,
    screen: chapter.screen,
    duration: audio.duration,
    clip,
  });
  console.log(
    `chapter ${chapter.number} · ${audio.duration.toFixed(1)}s · ${chapter.title}`,
  );
}

const concatFile = path.join(WORK, "concat.txt");
writeFileSync(
  concatFile,
  chapterReceipts.map((chapter) => `file '${chapter.clip.replace(/'/g, "'\\''")}'`).join("\n") + "\n",
);
const master = path.join(OUT, "image-video-lab-tutorial.mp4");
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
const chapters = chapterReceipts.map((chapter) => {
  const entry = { ...chapter, start, end: start + chapter.duration };
  start += chapter.duration;
  delete entry.clip;
  return entry;
});

const assetDir = path.resolve("src/assets/learn");
mkdirSync(assetDir, { recursive: true });
const asset = path.join(assetDir, "image-video-lab-tutorial.mp4");
copyFileSync(master, asset);
const buildAssetDir = path.resolve("Build/browser/assets/learn");
if (existsSync(path.resolve("Build/browser"))) {
  mkdirSync(buildAssetDir, { recursive: true });
  copyFileSync(master, path.join(buildAssetDir, "image-video-lab-tutorial.mp4"));
}

const receipt = {
  video: path.relative(ROOT, master),
  asset: path.relative(ROOT, asset),
  duration: start,
  chapters,
  sentences: sentenceFiles.length,
  maleVoices: new Set(voiceLog.filter((v) => v.speaker === "male").map((v) => v.voice)).size,
  femaleVoices: new Set(voiceLog.filter((v) => v.speaker === "female").map((v) => v.voice)).size,
  voiceOrder: voiceLog.map((entry) => entry.voice),
  genderOrder: voiceLog.map((entry) => entry.speaker),
  adjacentVoiceRepeats: voiceLog.filter(
    (entry, index) => index > 0 && entry.voice === voiceLog[index - 1].voice,
  ).length,
  randomVoiceOrder: true,
  mixedGenders: new Set(voiceLog.map((entry) => entry.speaker)).size === 2,
  voiceLog,
  bytes: statSync(master).size,
  createdAt: new Date().toISOString(),
};
writeFileSync(path.join(OUT, "export.json"), JSON.stringify(receipt, null, 2));
console.log(
  `\nEXPORT ${master}\nduration ${start.toFixed(2)}s | ${chapters.length} chapters | ${sentenceFiles.length} sentences`,
);
console.log(
  `voices ${receipt.maleVoices} male + ${receipt.femaleVoices} female | random order | adjacent repeats ${receipt.adjacentVoiceRepeats}`,
);
console.log(`gender order: ${receipt.genderOrder.join(" → ")}`);
for (const chapter of chapters) {
  console.log(`  ${chapter.number} @ ${chapter.start.toFixed(1)}s — ${chapter.title}`);
}
