import { spawn } from "node:child_process";
import { randomInt } from "node:crypto";

/**
 * A WHIP publisher for tests, so the browser hop is exercised without a browser.
 *
 * The browser's real contribution to this pipeline is: encode H.264, negotiate
 * WebRTC against MediaMTX's WHIP endpoint, and send RTP. This does the same with
 * werift (the WebRTC stack) and ffmpeg (the encoder), which is close enough to
 * catch what a fake would hide — SDP/codec mismatches, ICE that never connects,
 * and RTP that arrives but is never decodable.
 *
 * werift is not a project dependency; the caller resolves it and passes the
 * module in, so a checkout without it skips the test instead of failing.
 */

const FRAME_RATE = 15;
const CLOCK_RATE = 90_000;
/** SPS/PPS/IDR before the first usable frame; keep it short but not one frame. */
const ENCODER_ARGS = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-re",
  "-f",
  "lavfi",
  "-i",
  `testsrc2=size=320x240:rate=${FRAME_RATE}`,
  "-c:v",
  "libx264",
  "-profile:v",
  "baseline",
  "-level",
  "3.1",
  "-preset",
  "ultrafast",
  "-tune",
  "zerolatency",
  "-g",
  String(FRAME_RATE),
  "-bf",
  "0",
  "-pix_fmt",
  "yuv420p",
  "-x264-params",
  "aud=1",
  "-f",
  "h264",
  "pipe:1",
];

/**
 * Split an Annex-B byte stream into access units, using the AUD that x264
 * writes at the head of each one. Returns whole NAL sequences with their start
 * codes intact, which is what the packetizer wants.
 */
export function createAnnexBSplitter(onAccessUnit) {
  let pending = Buffer.alloc(0);
  let current = null;

  const startCodeAt = (buffer, from) => {
    for (let index = from; index + 3 < buffer.length; index += 1) {
      if (
        buffer[index] === 0 &&
        buffer[index + 1] === 0 &&
        buffer[index + 2] === 1
      ) {
        return { index, length: 3 };
      }
      if (
        buffer[index] === 0 &&
        buffer[index + 1] === 0 &&
        buffer[index + 2] === 0 &&
        buffer[index + 3] === 1
      ) {
        return { index, length: 4 };
      }
    }
    return null;
  };

  const flushNal = (nal, headerOffset) => {
    if (!nal || nal.length <= headerOffset) return;
    const type = nal[headerOffset] & 0x1f;
    if (type === 9 && current) {
      onAccessUnit(current);
      current = null;
    }
    current = current ? Buffer.concat([current, nal]) : Buffer.from(nal);
  };

  return {
    push(chunk) {
      pending = Buffer.concat([pending, chunk]);
      for (;;) {
        const first = startCodeAt(pending, 0);
        if (!first) return;
        const next = startCodeAt(pending, first.index + first.length);
        if (!next) {
          // Keep the start code so the NAL header stays addressable.
          pending = pending.subarray(first.index);
          return;
        }
        const nal = pending.subarray(first.index, next.index);
        flushNal(nal, first.length);
        pending = pending.subarray(next.index);
      }
    },
    flush() {
      if (current) onAccessUnit(current);
      current = null;
      pending = Buffer.alloc(0);
    },
  };
}

/**
 * Publish a generated test pattern to a WHIP endpoint.
 *
 * @param {object} options
 * @param {object} options.werift Resolved werift module (needs RTCPeerConnection,
 *   RTCRtpCodecParameters and H264Packetizer).
 * @param {string} options.whipUrl MediaMTX WHIP endpoint for the session path.
 * @param {string} options.ffmpegPath ffmpeg binary used as the encoder.
 */
export async function createWhipPublisher({
  werift,
  whipUrl,
  ffmpegPath = "ffmpeg",
  logger = console,
}) {
  const { RTCPeerConnection, RTCRtpCodecParameters, H264Packetizer } = werift;
  if (!RTCPeerConnection || !RTCRtpCodecParameters || !H264Packetizer) {
    throw new Error("werift is missing the WebRTC pieces the WHIP client needs");
  }

  const payloadType = 96;
  const pc = new RTCPeerConnection({
    iceServers: [],
    // A test publishes to 127.0.0.1; without pinning the family werift can
    // gather only a ULA IPv6 candidate and never pair with MediaMTX's IPv4 one.
    iceUseDefaultStunServer: false,
    iceUseIpv6: false,
    iceInterfaceAddresses: { udp4: "127.0.0.1" },
    codecs: {
      video: [
        new RTCRtpCodecParameters({
          mimeType: "video/H264",
          clockRate: CLOCK_RATE,
          payloadType,
          // werift wants the fmtp parameters as a raw semicolon list.
          parameters:
            "packetization-mode=1;profile-level-id=42e01f;level-asymmetry-allowed=1",
        }),
      ],
    },
  });

  const transceiver = pc.addTransceiver("video", { direction: "sendonly" });
  const sender = transceiver.sender;
  const packetizer = new H264Packetizer({
    payloadType,
    ssrc: sender.ssrc,
    sequenceNumber: randomInt(0, 0xffff),
  });

  let encoder = null;
  let encoderLog = "";
  let accessUnits = 0;
  let timestamp = randomInt(0, CLOCK_RATE);

  const sendAccessUnit = async (unit) => {
    const packets = packetizer.packetize(unit, timestamp);
    timestamp += CLOCK_RATE / FRAME_RATE;
    accessUnits += 1;
    for (const packet of packets) {
      await sender.sendRtp(packet);
    }
  };

  const splitter = createAnnexBSplitter((unit) => {
    // Fire and forget in order: sendRtp is queued per sender.
    void sendAccessUnit(unit).catch((error) =>
      logger.error?.(`[whip] send failed: ${error?.message ?? error}`),
    );
  });

  return {
    pc,
    get accessUnits() {
      return accessUnits;
    },
    get encoderLog() {
      return encoderLog;
    },
    async start() {
      await pc.setLocalDescription(await pc.createOffer());
      // Non-trickle: the whole offer, candidates included, in one POST.
      for (let waited = 0; pc.iceGatheringState !== "complete"; waited += 100) {
        if (waited > 5_000) throw new Error("ICE gathering never completed");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const offer = pc.localDescription;
      const response = await fetch(whipUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          `WHIP endpoint refused the offer (${response.status}): ${body.slice(0, 300)}`,
        );
      }
      await pc.setRemoteDescription({ type: "answer", sdp: body });

      encoder = spawn(ffmpegPath, ENCODER_ARGS, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      encoder.stdout.on("data", (chunk) => splitter.push(chunk));
      encoder.stderr.on("data", (chunk) => {
        encoderLog += chunk;
      });

      for (let waited = 0; pc.connectionState !== "connected"; waited += 100) {
        if (waited > 10_000) {
          throw new Error(
            `WebRTC never connected (state ${pc.connectionState})`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return offer.sdp;
    },
    async stop() {
      splitter.flush();
      encoder?.kill("SIGKILL");
      encoder = null;
      await pc.close().catch(() => {});
    },
  };
}
