/** A generated capture plus the function that releases it. */
export interface TestPattern {
  stream: MediaStream;
  stop: () => void;
}

const WIDTH = 640;
const HEIGHT = 360;
const FPS = 15;

/**
 * A capture that proves a broadcast path without a camera or a game.
 *
 * The relay self-test publishes this with the same WHIP publisher a real host
 * uses, so what it proves is the real pipeline: browser encode → WHIP →
 * MediaMTX → ffmpeg → RTMP. Colour bars make a mis-encoded frame obvious to
 * anyone watching the sink, and a low tone gives the audio track real content.
 */
export function createTestPattern(): TestPattern | null {
  if (typeof document === "undefined" || typeof MediaStream === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const bars = [
    "#ffffff",
    "#ffe600",
    "#00e5ff",
    "#00d26a",
    "#c026d3",
    "#ff2d55",
    "#2563eb",
    "#0f172a",
  ];
  let frame = 0;

  const draw = () => {
    frame += 1;
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const barWidth = WIDTH / bars.length;
    bars.forEach((colour, index) => {
      ctx.fillStyle = colour;
      ctx.fillRect(index * barWidth, 0, barWidth, 110);
    });
    // A moving block: a frozen picture is the failure mode a still pattern hides.
    ctx.fillStyle = "#3ddc97";
    ctx.fillRect((frame * 6) % (WIDTH - 80), 220, 80, 80);
    ctx.fillStyle = "#e8fbff";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.fillText("S.M.U.V.E SELF-TEST", WIDTH / 2, 160);
    ctx.fillText(String(frame), WIDTH / 2, 330);
  };
  draw();
  const timer = setInterval(draw, 1000 / FPS);
  const stream = canvas.captureStream(FPS);

  let audio: AudioContext | null = null;
  let oscillator: OscillatorNode | null = null;
  try {
    const AudioConstructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (AudioConstructor) {
      audio = new AudioConstructor();
      oscillator = audio.createOscillator();
      const gain = audio.createGain();
      gain.gain.value = 0.02;
      const destination = audio.createMediaStreamDestination();
      oscillator.type = "sine";
      oscillator.frequency.value = 440;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      for (const track of destination.stream.getAudioTracks()) {
        stream.addTrack(track);
      }
    }
  } catch {
    // A video-only pattern still proves the video path.
  }

  return {
    stream,
    stop: () => {
      clearInterval(timer);
      try {
        oscillator?.stop();
      } catch {
        /* already stopped */
      }
      void audio?.close().catch(() => undefined);
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
