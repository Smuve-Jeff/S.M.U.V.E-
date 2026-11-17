import { Injectable, signal } from '@angular/core';

export type WhipState = 'idle' | 'connecting' | 'live' | 'error';

/** Host candidates are gathered before the offer: WHIP without trickle ICE. */
const ICE_GATHER_TIMEOUT_MS = 2_500;

const STUN_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** The relay copies the track into FLV, which cannot carry VP8, VP9 or AV1. */
const REQUIRED_VIDEO_CODEC = 'video/h264';

/**
 * `setCodecPreferences` takes `Iterable<RTCRtpCodec>`, which is the name this
 * TypeScript version's DOM lib gives the capability objects.
 */
export type VideoCodec = RTCRtpCodec;

/**
 * H.264 only, constrained baseline first.
 *
 * The relay's ffmpeg is `-c copy`, so whatever the browser negotiates ends up in
 * the FLV muxer unchanged: an H.264 track is carried, a VP8 or AV1 track is not,
 * and the failure appears at the provider rather than here. Returning only the
 * H.264 capabilities means the browser cannot answer with anything else, which
 * is stronger than merely listing H.264 first.
 *
 * Profiles are ordered constrained baseline (42…), main (4d…), then the rest:
 * baseline is the profile every RTMP ingest and FLV player handles, and it is what
 * MediaMTX offers first for WebRTC. Returns null when the browser offers no H.264
 * at all, so the caller can refuse the push instead of publishing something the
 * relay cannot mux.
 */
export function h264Only(codecs: readonly VideoCodec[]): VideoCodec[] | null {
  const h264 = codecs.filter(
    (codec) => codec.mimeType?.toLowerCase() === REQUIRED_VIDEO_CODEC
  );
  if (h264.length === 0) return null;
  const profileRank = (codec: VideoCodec): number => {
    const profile =
      (codec.sdpFmtpLine ?? '')
        .match(/profile-level-id=([0-9a-f]{6})/i)?.[1]
        ?.toLowerCase() ?? '';
    if (profile.startsWith('42')) return 0;
    if (profile.startsWith('4d')) return 1;
    return 2;
  };
  // sort() is stable, so browsers that offer several baseline variants keep
  // their own relative order.
  return [...h264].sort((a, b) => profileRank(a) - profileRank(b));
}

/**
 * Express the preference on the video transceiver, before the offer is created.
 *
 * Returns a message when the push cannot work, null when it was applied or when
 * this browser is too old to express a preference at all — an old browser still
 * publishes, exactly as it did before, rather than being blocked outright.
 */
export function applyH264Preference(
  pc: RTCPeerConnection,
  sender: RTCRtpSender
): string | null {
  const capabilities = RTCRtpSender.getCapabilities?.('video');
  if (!capabilities) return null;
  const preferred = h264Only(capabilities.codecs ?? []);
  if (!preferred) {
    return 'THIS BROWSER HAS NO H.264 ENCODER — THE RELAY CANNOT CARRY ANOTHER CODEC';
  }
  const transceiver = pc.getTransceivers().find((entry) => entry.sender === sender);
  if (!transceiver || typeof transceiver.setCodecPreferences !== 'function') {
    return null;
  }
  try {
    transceiver.setCodecPreferences(preferred);
  } catch {
    // A rejected preference list is not fatal: the push proceeds with the
    // browser's own order, and the codec check on the relay's session shows it.
  }
  return null;
}

/**
 * Publish a MediaStream over WHIP (RFC 9725).
 *
 * The browser cannot speak RTMP, so this is how a capture actually leaves the
 * app: one SDP offer to the relay's WHIP endpoint, an answer back, and the
 * relay pushes RTMP to Twitch or Kick. Tracks are added once and swapped with
 * `replaceTrack`, so a camera ↔ game switch does not renegotiate mid-broadcast.
 *
 * RTMP/FLV carries one audio stream, so when the host publishes the mic and
 * shared-screen sound together they are mixed into a single Web Audio track
 * before the WHIP sender ever sees them. Replacing that track on a source
 * switch is what makes game audio reach both the provider and its recording.
 */
@Injectable({ providedIn: 'root' })
export class WhipPublisher {
  readonly state = signal<WhipState>('idle');
  readonly error = signal<string | null>(null);

  private pc?: RTCPeerConnection;
  private resourceUrl: string | null = null;
  private videoSender?: RTCRtpSender;
  private audioSender?: RTCRtpSender;
  private audioContext?: AudioContext;
  private audioMixSources: MediaStreamAudioSourceNode[] = [];
  private audioMixDestination?: MediaStreamAudioDestinationNode;
  private audioMixTrack?: MediaStreamTrack;
  /** Bumped on every start/stop so a late answer cannot resurrect a dead push. */
  private round = 0;

  async start(whipUrl: string, stream: MediaStream): Promise<boolean> {
    // Keep the context primed by the click: start() runs after the API's
    // session round trip, so a context created here can already be suspended.
    await this.teardown(false);
    const round = ++this.round;
    this.error.set(null);
    this.state.set('connecting');

    try {
      const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
      this.pc = pc;
      const video = stream.getVideoTracks()[0];
      const audioTracks = stream.getAudioTracks();
      const audio =
        audioTracks.length > 1
          ? this.mixAudioTracks(audioTracks) ?? audioTracks[0]
          : audioTracks[0];
      if (video) this.videoSender = pc.addTrack(video, stream);
      if (audio) this.audioSender = pc.addTrack(audio, stream);
      if (!video && !audio) {
        await this.stop();
        this.state.set('error');
        this.error.set('NOTHING TO SEND — NO CAPTURE TRACKS');
        return false;
      }

      if (video && this.videoSender) {
        const codecProblem = applyH264Preference(pc, this.videoSender);
        if (codecProblem) {
          await this.stop();
          this.state.set('error');
          this.error.set(codecProblem);
          return false;
        }
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error('NO_LOCAL_SDP');

      const response = await fetch(whipUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Accept: 'application/sdp',
        },
        body: sdp,
      });
      if (round !== this.round) return false;
      if (!response.ok) throw new Error(`WHIP_HTTP_${response.status}`);

      const location = response.headers.get('Location');
      this.resourceUrl = location
        ? new URL(location, whipUrl).toString()
        : null;
      const answer = await response.text();
      if (!answer.trim()) throw new Error('WHIP_EMPTY_ANSWER');
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      if (round !== this.round) return false;
      this.state.set('live');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.stop();
      if (round === this.round) {
        this.state.set('error');
        this.error.set(message.replace(/_/g, ' '));
      }
      return false;
    }
  }

  /**
   * Create or resume the mixer's AudioContext from the initiating click.
   *
   * A push starts behind the API's session request, and a screen switch starts
   * behind the browser's display picker. By the time either reaches the mixer,
   * transient user activation can be gone — so the context is created or
   * resumed synchronously here, on the click, and then reused by
   * `mixAudioTracks`. Without this the mix can be born suspended: tracks exist
   * and the WHIP push looks healthy, but the recording and provider receive
   * silence.
   */
  primeAudioContext(): void {
    const context = this.ensureAudioContext();
    if (context && context.state !== 'running') {
      void context.resume().catch(() => undefined);
    }
  }

  /**
   * Close a context primed for a click whose push never reached WHIP.
   * Only call this when no session is connecting or live; a real stop owns
   * the teardown of a session that did start.
   */
  closePrimedAudioContext(): void {
    if (this.state() === 'connecting' || this.state() === 'live') return;
    this.closeAudioContext();
  }

  /** Swap the outbound video track without renegotiating. */
  replaceVideoTrack(track: MediaStreamTrack | null): void {
    if (!this.videoSender) return;
    void this.videoSender.replaceTrack(track).catch(() => undefined);
  }

  /**
   * Replace the outbound picture and the one mixed audio track together.
   * The single sender is also what keeps the provider feed alive across a
   * camera ↔ screen switch.
   */
  replaceTracks(stream: MediaStream): void {
    this.replaceVideoTrack(stream.getVideoTracks()[0] ?? null);
    this.replaceAudioTracks(stream.getAudioTracks());
  }

  /**
   * Keep exactly one audio sender. Two captures become a Web Audio mix; one
   * capture can stay the raw track, avoiding an unnecessary encoder hop.
   */
  private replaceAudioTracks(tracks: MediaStreamTrack[]): void {
    if (!this.audioSender) return;
    if (tracks.length > 1) {
      const mixed = this.mixAudioTracks(tracks);
      void this.audioSender
        .replaceTrack(mixed ?? tracks[0] ?? null)
        .catch(() => undefined);
      return;
    }
    this.clearAudioMix();
    void this.audioSender.replaceTrack(tracks[0] ?? null).catch(() => undefined);
  }

  /**
   * Mix the host's mic with shared-screen sound into the single audio track an
   * RTMP/FLV push can carry. Returns null when Web Audio is unavailable; the
   * caller then keeps the first capture rather than muting the push entirely.
   */
  private mixAudioTracks(tracks: MediaStreamTrack[]): MediaStreamTrack | null {
    this.clearAudioMix();
    const context = this.ensureAudioContext();
    if (!context) return null;
    try {
      if (context.state !== 'running') {
        void context.resume().catch(() => undefined);
      }
      const destination = context.createMediaStreamDestination();
      for (const track of tracks) {
        const source = context.createMediaStreamSource(
          new MediaStream([track])
        );
        source.connect(destination);
        this.audioMixSources.push(source);
      }
      this.audioMixDestination = destination;
      this.audioMixTrack = destination.stream.getAudioTracks()[0] ?? null;
      return this.audioMixTrack;
    } catch {
      this.clearAudioMix();
      return null;
    }
  }

  /** Disconnect the mix but keep the context warm for the next switch. */
  private clearAudioMix(): void {
    for (const source of this.audioMixSources) {
      try {
        source.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.audioMixSources = [];
    this.audioMixDestination?.stream.getTracks().forEach((track) => track.stop());
    this.audioMixDestination = undefined;
    this.audioMixTrack = undefined;
  }

  private ensureAudioContext(): AudioContext | null {
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (typeof Ctor !== 'function') return null;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      return this.audioContext;
    }
    try {
      this.audioContext = new Ctor();
      return this.audioContext;
    } catch {
      this.audioContext = undefined;
      return null;
    }
  }

  private closeAudioContext(): void {
    this.clearAudioMix();
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = undefined;
    }
  }

  async stop(): Promise<void> {
    await this.teardown(true);
  }

  /**
   * Tear down the WHIP session. `start()` preserves the primed AudioContext;
   * an actual stop closes it and releases the mixer's destination track.
   */
  private async teardown(closeAudio: boolean): Promise<void> {
    this.round += 1;
    const resource = this.resourceUrl;
    this.resourceUrl = null;
    if (closeAudio) this.closeAudioContext();
    else this.clearAudioMix();
    this.videoSender = undefined;
    this.audioSender = undefined;
    this.pc?.close();
    this.pc = undefined;
    if (this.state() !== 'idle') this.state.set('idle');
    if (resource) {
      try {
        // WHIP teardown is a DELETE on the resource the server handed back.
        await fetch(resource, { method: 'DELETE' });
      } catch {
        // The relay's own timeout closes a session we could not delete.
      }
    }
  }
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}
