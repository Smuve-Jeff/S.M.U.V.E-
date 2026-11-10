#!/usr/bin/env node
/**
 * Generate a multi-voice S.M.U.V.E. Prime narration.
 *
 * Each sentence gets a different authoritative English voice. The selector is
 * random but never repeats the previous voice, and a seed makes the rotation
 * reproducible. The clips are normalized, joined with a short pause, and
 * written as one MP3 next to a JSON voice map.
 *
 *   python3 -m pip install edge-tts
 *   node scripts/prime-voice-rotation.mjs \
 *     --text-file artifacts/studio-masterclass-narration.txt \
 *     --out artifacts/studio-masterclass-narration-rotated.mp3
 *
 * The recorder can invoke this automatically:
 *
 *   PRIME_VOICE_ROTATION=1 PRIME_VOICE_SEED=20261110 \
 *   node scripts/record-studio-masterclass-demo.mjs
 *
 * Environment:
 *   PYTHON_BIN         Python executable (default: python3, or python on Windows)
 *   EDGE_TTS_BIN       edge-tts executable (default: discover, else `python -m edge_tts`)
 *   FFMPEG_PATH        ffmpeg executable (default: ffmpeg)
 *   PRIME_VOICE_POOL   comma-separated Edge voice names
 *   PRIME_VOICE_SEED   unsigned integer seed for a repeatable rotation
 *
 * No credentials are needed. If you use a custom voice list, verify every
 * voice exists with `python3 -m edge_tts --list-voices`.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_VOICES = [
  "en-US-GuyNeural",
  "en-US-ChristopherNeural",
  "en-US-BrianNeural",
  "en-GB-RyanNeural",
  "en-GB-ThomasNeural",
  "en-AU-WilliamNeural",
  "en-IE-ConnorNeural",
  "en-CA-LiamNeural",
];
const RATE = "-4%";
const PITCH = "-6Hz";
const PAUSE_SECONDS = 0.16;

function commandExists(command) {
  const finder = process.platform === "win32" ? "where" : "which";
  return (
    spawnSync(finder, [command], {
      stdio: "ignore",
      shell: process.platform === "win32",
    }).status === 0
  );
}

function readOption(args, name) {
  const index = args.findIndex(
    (argument) => argument === name || argument.startsWith(`${name}=`),
  );
  if (index < 0) return undefined;
  if (args[index].includes("="))
    return args[index].split("=").slice(1).join("=");
  return args[index + 1];
}

function usage() {
  console.log(`Prime voice rotation

Usage:
  node scripts/prime-voice-rotation.mjs --text-file <file> --out <mp3> [options]

Options:
  --seed <integer>       repeatable rotation seed
  --voices <a,b,c>       Edge voice names (default: Prime ensemble)
  --help                 show this message

Environment:
  PYTHON_BIN, EDGE_TTS_BIN, FFMPEG_PATH
  PRIME_VOICE_POOL, PRIME_VOICE_SEED
`);
}

function splitSentences(text) {
  // The period inside S.M.U.V.E. is not a sentence boundary.
  const protectedText = text.trim().replace(/S\.M\.U\.V\.E\./g, "S~M~U~V~E~");
  const parts = protectedText.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g) || [
    protectedText,
  ];
  return parts
    .map((part) => part.replace(/S~M~U~V~E~/g, "S.M.U.V.E.").trim())
    .filter(Boolean);
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

function parseVoices(args) {
  const raw =
    readOption(args, "--voices") ||
    process.env.PRIME_VOICE_POOL ||
    DEFAULT_VOICES.join(",");
  const voices = [
    ...new Set(
      raw
        .split(",")
        .map((voice) => voice.trim())
        .filter(Boolean),
    ),
  ];
  if (voices.length < 2) {
    throw new Error(
      "The rotation needs at least two voices. Set PRIME_VOICE_POOL to a comma-separated list.",
    );
  }
  return voices;
}

function parseSeed(args) {
  const raw =
    readOption(args, "--seed") ||
    process.env.PRIME_VOICE_SEED ||
    String(crypto.randomBytes(4).readUInt32BE(0));
  const seed = Number.parseInt(raw, 10);
  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error(`Invalid PRIME_VOICE_SEED: ${raw}`);
  }
  return seed >>> 0;
}

function selectVoices(sentences, voices, seed) {
  const random = mulberry32(seed);
  let previous = null;
  return sentences.map((text, index) => {
    let candidates = voices.filter((voice) => voice !== previous);
    if (candidates.length === 0) candidates = voices;
    const voice = candidates[Math.floor(random() * candidates.length)];
    previous = voice;
    return { index: index + 1, text, voice };
  });
}

function edgeCommand() {
  const bin = process.env.EDGE_TTS_BIN;
  if (bin) return { command: bin, prefix: [] };
  if (commandExists("edge-tts")) {
    return { command: "edge-tts", prefix: [] };
  }
  const python =
    process.env.PYTHON_BIN ||
    (process.platform === "win32" ? "python" : "python3");
  return { command: python, prefix: ["-m", "edge_tts"] };
}

function renderSentence(edge, text, voice, file) {
  const args = [
    ...edge.prefix,
    "--voice",
    voice,
    `--rate=${RATE}`,
    `--pitch=${PITCH}`,
    "--text",
    text,
    "--write-media",
    file,
  ];
  const result = spawnSync(edge.command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${edge.command} failed for ${voice}: ${
        result.stderr || result.stdout || "unknown error"
      }`,
    );
  }
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error(`No audio was written for ${voice}.`);
  }
}

function joinClips(clips, out, ffmpeg) {
  const inputs = clips.map((clip) => ["-i", clip]).flat();
  const prepare = clips
    .map(
      (_, index) =>
        `[${index}:a]aresample=24000,asetpts=PTS-STARTPTS,apad=pad_dur=${PAUSE_SECONDS}[a${index}]`,
    )
    .join(";");
  const streams = clips.map((_, index) => `[a${index}]`).join("");
  const filter = `${prepare};${streams}concat=n=${clips.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
  const args = [
    "-y",
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    out,
  ];
  const result = spawnSync(ffmpeg, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg could not join the voice clips: ${
        result.stderr || result.stdout || "unknown error"
      }`,
    );
  }
  if (!fs.existsSync(out) || fs.statSync(out).size === 0) {
    throw new Error("ffmpeg did not produce the rotated narration.");
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const textFile = readOption(args, "--text-file");
  const out = readOption(args, "--out");
  if (!textFile || !out) {
    usage();
    throw new Error("--text-file and --out are required.");
  }

  const text = fs.readFileSync(textFile, "utf8");
  const sentences = splitSentences(text);
  if (sentences.length === 0)
    throw new Error("The narration has no sentences.");

  const voices = parseVoices(args);
  const seed = parseSeed(args);
  const assignments = selectVoices(sentences, voices, seed);
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const ffmpegCheck = spawnSync(ffmpeg, ["-version"], { stdio: "ignore" });
  if (ffmpegCheck.status !== 0) {
    throw new Error(
      "ffmpeg is required to join the voice clips. Set FFMPEG_PATH or install ffmpeg.",
    );
  }

  const edge = edgeCommand();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "smuve-prime-voices-"));
  const clips = [];
  try {
    console.log(
      `Prime voice rotation · ${sentences.length} sentences · ${voices.length} voices · seed ${seed}`,
    );
    for (const assignment of assignments) {
      const clip = path.join(
        temp,
        `sentence-${String(assignment.index).padStart(2, "0")}.mp3`,
      );
      console.log(
        `${String(assignment.index).padStart(2, "0")}  ${assignment.voice.padEnd(
          30,
        )}  ${assignment.text}`,
      );
      renderSentence(edge, assignment.text, assignment.voice, clip);
      clips.push(clip);
    }

    fs.mkdirSync(path.dirname(out), { recursive: true });
    joinClips(clips, out, ffmpeg);

    const manifestPath = path.join(
      path.dirname(out),
      `${path.basename(out, path.extname(out))}.voices.json`,
    );
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          seed,
          rate: RATE,
          pitch: PITCH,
          voices,
          sentences: assignments,
          output: path.basename(out),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`Voice map: ${manifestPath}`);
    console.log(`Narration: ${out}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`Prime voice rotation failed: ${error?.message || error}`);
  process.exitCode = 1;
}
