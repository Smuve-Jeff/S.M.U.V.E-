#!/usr/bin/env node
/**
 * Build the Tha Spot feature video:
 *   1. synthesize every narration sentence with a rotating, gender-alternating voice
 *   2. cut the recorded tour into stops whose lengths match their narration
 *   3. burn chapter lower-thirds, concat, and mux the voice track
 *
 *   node scripts/build-tha-spot-video.mjs
 *
 * Output: artifacts/tha-spot-video/tha-spot-feature-tour.mp4
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("artifacts/tha-spot-video");
const WORK = path.join(OUT, "build");
const VOICE_DIR = path.join(WORK, "voice");
const CLIP_DIR = path.join(WORK, "clips");
const FFMPEG =
  process.env.FFMPEG_PATH ||
  "/tmp/smuve-media/node_modules/ffmpeg-static/ffmpeg";
const FONT =
  process.env.FONT_PATH ||
  "/opt/freestyle/python/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf";
const PYTHONPATH = process.env.TTS_PATH || "/tmp/tts";
const GAP = 0.16;

mkdirSync(VOICE_DIR, { recursive: true });
mkdirSync(CLIP_DIR, { recursive: true });

const marksFile = path.join(OUT, "marks.json");
if (!existsSync(marksFile)) {
  console.error("No marks.json — run scripts/capture-tha-spot-tour.mjs first.");
  process.exit(1);
}
const capture = JSON.parse(readFileSync(marksFile, "utf8"));
if (!existsSync(capture.tourPath)) {
  console.error(`Tour video missing: ${capture.tourPath}`);
  process.exit(1);
}

const SEGMENTS = [
  {
    id: "command",
    label: "01 · THE COMMAND DECK",
    lines: [
      "Tha Spot. My arcade floor. A thousand-plus cabinets wired into one nasty little screen.",
      "The header is your command strip: uplink status, controller detection, intel, chat, and a share link.",
      "Two modes, no compromise: GAMING for the floor, S.M.U.V.E TV for the broadcast. Flip that shit.",
    ],
  },
  {
    id: "floor",
    label: "02 · THE FLOOR",
    lines: [
      "The cinematic hero rotates the featured cabinet and drops you into the Arcade Floor or the Neo Zone.",
      "Under it, the stats bar keeps the receipts: cabinets, bodies online, live events, favorites.",
      "This is a storefront, a lobby, and a war room wearing the same coat.",
    ],
  },
  {
    id: "filters",
    label: "03 · FILTER THE NOISE",
    lines: [
      "Filter by room, genre, and platform. Reset the whole board when your taste changes, and it will.",
      "Recommendation rails read the room: elite picks, trending filth, new drops, staff favorites.",
      "The catalog reorders itself around your filters without a single reload.",
    ],
  },
  {
    id: "search",
    label: "04 · SEARCH & DESTROY",
    lines: [
      "Search is instant. Type a name and the floor folds around your obsession.",
      "Room, genre, platform, and query stay in the URL, so a shared link opens the exact same board.",
    ],
  },
  {
    id: "room",
    label: "05 · ROOM DISTRICTS",
    lines: [
      "Rooms are districts with their own lineup: the Arcade Floor, the Neo Zone, co-op halls, rotation events.",
      "Each one carries live chat and a body count. You are never lurking alone unless you choose to.",
    ],
  },
  {
    id: "mission",
    label: "06 · MISSION BRIEFING",
    lines: [
      "Click any cabinet and the mission briefing owns the screen: title, art, genre, rating, and mode.",
      "The briefing prints the field notes before you commit, so you know what the fuck you are walking into.",
      "Enter launches it. Escape backs out. No mystery buttons, no surprise downloads.",
    ],
  },
  {
    id: "launch",
    label: "07 · LAUNCH CONTRACT",
    lines: [
      "External cabinets throw the destination domain in your face before anything opens.",
      "Inline cabinets run inside the sandboxed console with fullscreen, reload, and a hard close.",
      "If a cabinet dies, the error bay catches it and retry drags it back onto the floor.",
    ],
  },
  {
    id: "rotation",
    label: "08 · YOUR ROTATION",
    lines: [
      "Your rotation lives in the rails: elite picks, trending filth, new drops, and staff favorites.",
      "Recent cabinets and favorites survive the session, so the floor remembers what you touch.",
      "Badges tell you what a cabinet is before you waste a launch: elite, next-gen, live, staff pick.",
    ],
  },
  {
    id: "lobbies",
    label: "09 · INSTANT LOBBIES",
    lines: [
      "Every multiplayer card carries a quick-lobby button. One tap opens a squad without leaving the grid.",
      "The lobby lands in the Rival Hub with a game chip, a ready state, and a chat rail.",
      "No menu maze. No waiting on a friend to find the right screen.",
    ],
  },
  {
    id: "squad",
    label: "10 · SQUAD UP",
    lines: [
      "Co-op matchmaking opens a lobby, queues the search, and drops a match when the room fills.",
      "Squads get a ready toggle, lobby chat, invite rails, and a quick-lobby button right on the card.",
      "Challenges land live: accept, decline, or neural-sync and drag your rival into the same cabinet.",
    ],
  },
  {
    id: "network",
    label: "11 · THE NETWORK",
    lines: [
      "The Executive Network holds your friends list, your DMs, and the people you keep close.",
      "Voice knocks ring before the call, because surprise audio is a coward's move.",
      "After a run, achievements and ratings land without leaving the floor.",
    ],
  },
  {
    id: "hub",
    label: "12 · THE RIVAL HUB",
    lines: [
      "The Rival Hub keeps the receipts: who is online, who is streaming, and who needs humbling.",
      "Room chat, direct messages, typing indicators, and voice knocks all live in the same rail.",
      "Open lobbies surface here, so a squad is one tap from becoming a full fucking match.",
    ],
  },
  {
    id: "ops",
    label: "13 · DAILY OPS",
    lines: [
      "Daily Ops turns the grind into rotating contracts: play a cabinet, win a round, squad up.",
      "Each contract tracks progress live, pays XP, and stamps a badge the moment you claim it.",
      "The streak counter keeps you honest. Ghost the floor and it resets, so consistency is the flex.",
    ],
  },
  {
    id: "intel",
    label: "14 · STRATEGIC INTEL",
    lines: [
      "Strategic Intel is the war room: loadout, meta, and what the floor is doing while you sit there.",
      "It reads the room so you can stop pretending you are above research.",
    ],
  },
  {
    id: "live",
    label: "15 · GO LIVE",
    lines: [
      "Go Live pushes to Twitch, Kick, YouTube, or S.M.U.V.E Live, and slaps a live pill on the surface.",
      "The join token hands your audience a door into the lobby instead of a spectator seat.",
      "Share links carry the game, the mode, the party, and the invite. One tap and your people land where you are.",
    ],
  },
  {
    id: "tv",
    label: "16 · S.M.U.V.E TV",
    lines: [
      "S.M.U.V.E TV turns the whole building into a channel: featured runs, live events, catalog as broadcast.",
      "It runs on the same floor, with no second app and no separate login.",
      "Split-screen puts two sessions on one screen, because sharing a couch should not mean sharing a disadvantage.",
    ],
  },
  {
    id: "radio",
    label: "17 · S.M.U.V.E. JEFF RADIO",
    lines: [
      "And when you want the catalogue itself, S.M.U.V.E. Jeff Radio sits one tap from the TV guide.",
      "Full records, artwork, and the running order, broadcast 24/7 with no playlist to manage.",
      "A thousand cabinets, one floor, zero excuses. Tha Spot is open, and I already know you are coming back.",
    ],
  },
];

const MALE = [
  "en-US-GuyNeural", "en-US-DavisNeural", "en-US-JasonNeural", "en-US-TonyNeural",
  "en-US-AndrewNeural", "en-US-BrianNeural", "en-GB-RyanNeural", "en-AU-WilliamNeural",
  "en-CA-LiamNeural", "en-IE-ConnorNeural", "en-IN-PrabhatNeural", "en-NZ-MitchellNeural",
  "en-ZA-LukeNeural",
];
const FEMALE = [
  "en-US-JennyNeural", "en-US-AriaNeural", "en-US-JaneNeural", "en-US-NancyNeural",
  "en-US-EmmaNeural", "en-US-AvaNeural", "en-GB-SoniaNeural", "en-AU-NatashaNeural",
  "en-CA-ClaraNeural", "en-IE-EmilyNeural", "en-IN-NeerjaNeural", "en-NZ-MollyNeural",
  "en-ZA-LeahNeural",
];

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const maleBank = shuffled(MALE);
const femaleBank = shuffled(FEMALE);
const used = { male: 0, female: 0 };
let speaker = Math.random() < 0.5 ? "male" : "female";

function nextVoice() {
  const key = speaker;
  speaker = key === "male" ? "female" : "male";
  const bank = key === "male" ? maleBank : femaleBank;
  const voice = bank[used[key] % bank.length];
  used[key] += 1;
  return { key, voice };
}

function run(bin, args, opts = {}) {
  const res = spawnSync(bin, args, { encoding: "utf8", ...opts });
  if (res.error) throw res.error;
  return res;
}

function mediaDuration(file) {
  const res = run(FFMPEG, ["-hide_banner", "-i", file]);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(res.stderr || "");
  if (!m) throw new Error(`Could not read duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function toWav(mp3, wav) {
  const res = run(FFMPEG, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", mp3, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", wav,
  ]);
  if (res.status !== 0) throw new Error(res.stderr || `ffmpeg failed for ${mp3}`);
}

const labelDir = path.join(WORK, "labels");
mkdirSync(labelDir, { recursive: true });
const labelItems = SEGMENTS.map((s, i) => ({
  text: s.label,
  path: path.join(labelDir, `${String(i).padStart(2, "0")}.png`),
}));
const pyLabels = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
payload = json.load(sys.stdin)
font = ImageFont.truetype(payload["font"], 26)
for item in payload["items"]:
    text = item["text"]
    box = font.getbbox(text)
    w = box[2] - box[0] + 38
    h = box[3] - box[1] + 26
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=8, fill=(4, 6, 15, 200))
    draw.text((19, 13 - box[1]), text, font=font, fill=(255, 255, 255, 255))
    img.save(item["path"])
`;
const labelRun = run("python3", ["-c", pyLabels], {
  input: JSON.stringify({ font: FONT, items: labelItems }),
});
if (labelRun.status !== 0) {
  console.error(labelRun.stderr || "label generation failed");
  process.exit(8);
}

const silencePath = path.join(WORK, "silence.wav");
run(FFMPEG, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(GAP),
  "-c:a", "pcm_s16le", silencePath,
]);

const spoken = [];
const concatLines = [];
let index = 0;
for (const segment of SEGMENTS) {
  segment.audio = 0;
  for (const text of segment.lines) {
    const { key, voice } = nextVoice();
    const stamp = String(index).padStart(3, "0");
    const mp3 = path.join(VOICE_DIR, `${stamp}.mp3`);
    const wav = path.join(VOICE_DIR, `${stamp}.wav`);
    const rateNum = Math.floor(Math.random() * 9);
    const pitchNum = Math.floor(Math.random() * 13);
    const rate = `${rateNum >= 0 ? "+" : ""}${rateNum}%`;
    const pitch = `${pitchNum >= 0 ? "+" : ""}${pitchNum}Hz`;
    const synth = (v, r, p) =>
      run(
        "python3",
        [
          "-m", "edge_tts",
          "--voice", v,
          `--rate=${r}`,
          `--pitch=${p}`,
          "--text", text,
          "--write-media", mp3,
        ],
        { env: { ...process.env, PYTHONPATH }, timeout: 90000 },
      );
    let res = synth(voice, rate, pitch);
    let usedVoice = voice;
    if (res.status !== 0 || !existsSync(mp3) || statSync(mp3).size < 800) {
      const fallback = key === "male" ? "en-US-GuyNeural" : "en-US-JennyNeural";
      console.warn(`\nvoice fallback: ${voice} -> ${fallback}`);
      res = synth(fallback, "+0%", "+0Hz");
      usedVoice = fallback;
    }
    if (res.status !== 0 || !existsSync(mp3) || statSync(mp3).size < 800) {
      console.error(`TTS failed (${voice}): ${(res.stderr || "").slice(0, 500)}`);
      process.exit(2);
    }
    toWav(mp3, wav);
    const dur = mediaDuration(wav);
    segment.audio += dur;
    spoken.push({ index, segment: segment.id, text, voice: usedVoice, gender: key, dur });
    concatLines.push(`file '${wav.replace(/'/g, "'\\''")}'`);
    if (text !== segment.lines[segment.lines.length - 1]) {
      concatLines.push(`file '${silencePath}'`);
      segment.audio += GAP;
    }
    index += 1;
    process.stdout.write(`\r${index}/${SEGMENTS.reduce((n, s) => n + s.lines.length, 0)} voices`);
  }
}
console.log("");

const narrationPath = path.join(OUT, "narration.wav");
const listPath = path.join(WORK, "voice-list.txt");
writeFileSync(listPath, concatLines.join("\n") + "\n");
let res = run(FFMPEG, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", listPath,
  "-c:a", "pcm_s16le", narrationPath,
]);
if (res.status !== 0) {
  console.error(res.stderr);
  process.exit(3);
}
const totalAudio = mediaDuration(narrationPath);

// Video durations mirror narration; add the inter-segment breath to all but the last.
const marks = new Map(capture.marks.map((m) => [m.id, m]));
const clipPaths = [];
let timeline = 0;
const chapters = [];
for (let i = 0; i < SEGMENTS.length; i++) {
  const segment = SEGMENTS[i];
  const mark = marks.get(segment.id);
  if (!mark) {
    console.error(`Missing capture mark for ${segment.id}`);
    process.exit(4);
  }
  const available = Math.max(1, mark.end - mark.start - 0.4);
  const audioLen = segment.audio + (i < SEGMENTS.length - 1 ? GAP : 0);
  const offset = Math.min(0.8, Math.max(0, mark.end - mark.start - audioLen - 0.2));
  const take = Math.min(audioLen, Math.max(0.5, mark.end - mark.start - offset));
  const pad = Math.max(0, audioLen - take);
  const clip = path.join(CLIP_DIR, `${String(i).padStart(2, "0")}-${segment.id}.mp4`);
  const labelPng = labelItems[i].path;
  const filter =
    `[0:v]scale=1280:720:force_original_aspect_ratio=decrease,` +
    `pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,` +
    `tpad=stop_mode=clone:stop_duration=${Math.max(0.1, pad + 0.5).toFixed(2)}[bg];` +
    `[1:v]format=rgba[lbl];[bg][lbl]overlay=44:H-h-64:format=auto[v]`;
  res = run(FFMPEG, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-ss", (mark.start + offset).toFixed(3),
    "-t", take.toFixed(3),
    "-i", capture.tourPath,
    "-i", labelPng,
    "-filter_complex", filter,
    "-map", "[v]", "-an",
    "-t", audioLen.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-r", "30", clip,
  ]);
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(5);
  }
  clipPaths.push(clip);
  chapters.push({
    label: segment.label,
    start: Number(timeline.toFixed(2)),
    end: Number((timeline + audioLen).toFixed(2)),
    voices: segment.lines.length,
  });
  timeline += audioLen;
}

const videoList = path.join(WORK, "video-list.txt");
writeFileSync(videoList, clipPaths.map((p) => `file '${p}'`).join("\n") + "\n");
const silentVideo = path.join(WORK, "video-silent.mp4");
res = run(FFMPEG, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", videoList,
  "-c", "copy", silentVideo,
]);
if (res.status !== 0) {
  console.error(res.stderr);
  process.exit(6);
}

const finalPath = path.join(OUT, "tha-spot-feature-tour.mp4");
res = run(FFMPEG, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-i", silentVideo, "-i", narrationPath,
  "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
  "-movflags", "+faststart", "-shortest", finalPath,
]);
if (res.status !== 0) {
  console.error(res.stderr);
  process.exit(7);
}

const finalDuration = mediaDuration(finalPath);
const maleVoices = new Set(spoken.filter((s) => s.gender === "male").map((s) => s.voice));
const femaleVoices = new Set(spoken.filter((s) => s.gender === "female").map((s) => s.voice));
const alternating = spoken.every((s, i) => i === 0 || s.gender !== spoken[i - 1].gender);
const meta = {
  video: finalPath,
  duration: Number(finalDuration.toFixed(2)),
  segments: chapters,
  sentences: spoken.length,
  maleVoices: [...maleVoices],
  femaleVoices: [...femaleVoices],
  strictlyAlternating: alternating,
  audio: Number(totalAudio.toFixed(2)),
  voiceLog: spoken,
};
writeFileSync(path.join(OUT, "export.json"), JSON.stringify(meta, null, 2));

console.log(`\nEXPORT ${finalPath}`);
console.log(`duration ${finalDuration.toFixed(2)}s | ${chapters.length} chapters | ${spoken.length} sentences`);
console.log(`voices ${maleVoices.size} male + ${femaleVoices.size} female | alternating: ${alternating}`);
