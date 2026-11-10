#!/usr/bin/env node
/**
 * Build the S.M.U.V.E 2.0 "Field Guide" tutorial.
 *
 *   node scripts/build-chat-tutorial.mjs
 *
 * Nine real assistant-drawer captures, 27 narration sentences in a mixed
 * male/female voice order with no adjacent repeat, burned chapter cards, and
 * one H.264/AAC master that ships inside the chatbot at src/assets/learn/.
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
const SCREENS = path.resolve("artifacts/chat-tutorial/screens");
const OUT = path.resolve("artifacts/chat-tutorial");
const WORK = path.join(OUT, "build");
const VOICE_DIR = path.join(WORK, "voice");
const CLIP_DIR = path.join(WORK, "clips");
const SLIDE_DIR = path.join(WORK, "slides");
const FFMPEG =
  process.env.FFMPEG_PATH ||
  "/tmp/smuve-media/node_modules/ffmpeg-static/ffmpeg";
const TTS_PATH = process.env.TTS_PATH || "/tmp/tts";
const SLIDE_PY = path.resolve("scripts/chat-tutorial-slide.py");
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
    screen: "01-open.png",
    full: true,
    kicker: "Launch",
    title: "Open the manager",
    subtitle: "From any workspace, without losing the room",
    lines: [
      "This is S.M.U.V.E. 2.0, the AI music manager that lives over every workspace. Open it from the neurology button in the top bar, or from the assistant launcher on the Hub.",
      "The header names the active persona and the lanes it can operate: production, marketing and business. It is a manager, not a search box with a logo.",
      "Close it with the X or Escape. The transcript stays filed for your account and the workspace stays exactly where you left it.",
    ],
  },
  {
    number: "02",
    screen: "02-context.png",
    kicker: "Context",
    title: "Brief it with your reality",
    subtitle: "Room, stage, profile and career cues",
    lines: [
      "S.M.U.V.E. reads the room before it answers. The strip below the header names the current surface, your career stage and the next move already on record.",
      "Career cues turn that reading into questions you can send. Use them when you want a running start, then edit the prompt with your own facts.",
      "The answer is only as specific as the record behind it. When the profile is incomplete, the console labels the context partial or foundational instead of inventing a read.",
    ],
  },
  {
    number: "03",
    screen: "03-commands.png",
    kicker: "Commands",
    title: "Command the four lanes",
    subtitle: "Production, Marketing, Business and slash",
    lines: [
      "Three category buttons open the command lanes. Production handles the record, Marketing handles the release, and Business handles the money and the paperwork.",
      "The slash chips at the bottom reach the rest of the system: studio control, splits, knowledge, navigation and export. You do not have to memorise the roster.",
      "The composer is the fastest path. Type the request, dictate it with the microphone, or start from a career cue; the bolt sends it.",
    ],
  },
  {
    number: "04",
    screen: "04-produce.png",
    kicker: "Production",
    title: "Produce inside the chat",
    subtitle: "Specific requests, real actions, explicit receipts",
    lines: [
      "Production runs inside the conversation. Ask for a beat, a composition or a mix in plain language, and S.M.U.V.E. answers with the move and the action that carries it into the session.",
      "Be specific about tempo, key, references, arrangement and the job the record has to do. A directionless prompt gets a directionless beat, no matter how confident the reply sounds.",
      "Read the receipt before you press an apply chip. Actions that change the session require Full Control, and the manager should tell you what it changed, not just that it did something.",
    ],
  },
  {
    number: "05",
    screen: "05-marketing.png",
    kicker: "Marketing",
    title: "Turn a release into a plan",
    subtitle: "Dates, hooks, assets and a measurable sequence",
    lines: [
      "Marketing turns a release into a runway. Give the date, audience, budget and the channels you can actually operate, then ask for the six-week plan.",
      "Demand hooks, assets and a posting sequence. A plan without dates, owners and a measurable check is decoration, not promotion.",
      "Make the manager choose. Ask what ships this week, what waits for playlist feedback, and what gets cut if the budget moves.",
    ],
  },
  {
    number: "06",
    screen: "06-business.png",
    kicker: "Business",
    title: "Protect the work and the money",
    subtitle: "Splits, royalties, sync and negotiation",
    lines: [
      "The business lane covers splits, royalties, registration, sync and negotiation. Ask it to audit the streams, draft split terms or prepare a contract position.",
      "Protect the work before delivery. Names, percentages, master ownership and the release date belong in writing, and every claim gets checked against the actual agreement.",
      "This is information and strategy, not legal advice. S.M.U.V.E. is not your attorney, and a confident answer cannot sign away your rights.",
    ],
  },
  {
    number: "07",
    screen: "07-voice.png",
    kicker: "Voice",
    title: "Hear the manager",
    subtitle: "Voice Lab, full spectrum and honest device limits",
    lines: [
      "Voice Lab is the identity, not a preset. Open it from the waveform button and the full tone roster appears, with the delivery texture beside every name.",
      "Audition one tone, run the full spectrum or pin a tone for the next reply. The register holds while the pitch bands keep moving inside it.",
      "The lab tells the truth about the device. If the browser has no speech voices, it says so instead of pretending; on a supported device, dictate with the microphone and stop a spoken reply when you have heard enough.",
    ],
  },
  {
    number: "08",
    screen: "08-control.png",
    kicker: "Control",
    title: "Give the manager hands",
    subtitle: "Mimic, Full Control and firm boundaries",
    lines: [
      "Mimic mode borrows your vocabulary and register from the committed profile, while the attitude and the voice movement stay S.M.U.V.E.",
      "Full Control gives the manager hands. With it on, one-tap actions can change tempo, load a composition or move the session; guarded actions still ask before they touch anything important.",
      "The lock controls Neural Vault write access, and the mood control decides whether explicit language is allowed. Set the boundaries once, then hold the manager to them.",
    ],
  },
  {
    number: "09",
    screen: "09-memory.png",
    kicker: "Memory",
    title: "Keep the case file clean",
    subtitle: "Memory, Clear and a focused thread",
    lines: [
      "Memory is the case file, not a backup. The counter shows what is in the current transcript, and Clear wipes it back to a fresh welcome.",
      "Keep one thread focused on the record in front of you. When the case changes, start clean so old decisions do not pollute the next verdict.",
      "Use the Field Guide when you forget a control: nine lessons, a real Show Me target and a video chapter for each. Now open the drawer and give the manager a real problem.",
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
    "-y", "-loglevel", "error",
    "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", rawPath,
    "-c:a", "pcm_s16le", wavPath,
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
    ...(chapter.full ? ["full"] : []),
  ]);
  const audio = chapterAudio.get(chapter.number);
  const clip = path.join(CLIP_DIR, `${chapter.number}.mp4`);
  run(FFMPEG, [
    "-y", "-loglevel", "error",
    "-loop", "1", "-framerate", "30", "-i", slide,
    "-i", audio.wavPath,
    "-t", audio.duration.toFixed(3),
    "-vf", "scale=1280:720,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-tune", "stillimage", "-r", "30",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
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
const master = path.join(OUT, "chat-music-manager-tutorial.mp4");
run(FFMPEG, [
  "-y", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", concatFile,
  "-c", "copy", "-movflags", "+faststart",
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
const asset = path.join(assetDir, "chat-music-manager-tutorial.mp4");
copyFileSync(master, asset);
const buildAssetDir = path.resolve("Build/browser/assets/learn");
if (existsSync(path.resolve("Build/browser"))) {
  mkdirSync(buildAssetDir, { recursive: true });
  copyFileSync(master, path.join(buildAssetDir, "chat-music-manager-tutorial.mp4"));
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
for (const chapter of chapters) {
  console.log(`  ${chapter.number} @ ${chapter.start.toFixed(2)}s — ${chapter.title}`);
}
