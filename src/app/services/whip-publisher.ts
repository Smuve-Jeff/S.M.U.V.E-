import { Injectable, signal } from '@angular/core';

export type WhipState = 'idle' | 'connecting' | 'live' | 'error';

/** Host candidates are gathered before the offer: WHIP without trickle ICE. */
const ICE_GATHER_TIMEOUT_MS = 2_500;

const STUN_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * Publish a MediaStream over WHIP (RFC 9725).
 *
 * The browser cannot speak RTMP, so this is how a capture actually leaves the
 * app: one SDP offer to the relay's WHIP endpoint, an answer back, and the
 * relay pushes RTMP to Twitch or Kick. Tracks are added once and swapped with
 * `replaceTrack`, so a camera ↔ game switch does not renegotiate mid-broadcast.
 */
@Injectable({ providedIn: 'root' })
export class WhipPublisher {
  readonly state = signal<WhipState>('idle');
  readonly error = signal<string | null>(null);

  private pc?: RTCPeerConnection;
  private resourceUrl: string | null = null;
  private videoSender?: RTCRtpSender;
  /** Bumped on every start/stop so a late answer cannot resurrect a dead push. */
  private round = 0;

  async start(whipUrl: string, stream: MediaStream): Promise<boolean> {
    await this.stop();
    const round = ++this.round;
    this.error.set(null);
    this.state.set('connecting');

    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.pc = pc;
    const video = stream.getVideoTracks()[0];
    const audio = stream.getAudioTracks()[0];
    if (video) this.videoSender = pc.addTrack(video, stream);
    if (audio) pc.addTrack(audio, stream);
    if (!video && !audio) {
      this.state.set('error');
      this.error.set('NOTHING TO SEND — NO CAPTURE TRACKS');
      return false;
    }

    try {
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

  /** Swap the outbound video track without renegotiating. */
  replaceVideoTrack(track: MediaStreamTrack | null): void {
    if (!this.videoSender) return;
    void this.videoSender.replaceTrack(track).catch(() => undefined);
  }

  async stop(): Promise<void> {
    this.round += 1;
    const resource = this.resourceUrl;
    this.resourceUrl = null;
    this.videoSender = undefined;
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
