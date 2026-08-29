import { Injectable, inject, signal } from '@angular/core';
import { SocialNetworkingService } from './social-networking.service';

@Injectable({ providedIn: 'root' })
export class PeerNetworkingService {
  private social = inject(SocialNetworkingService);
  private peerConnection?: RTCPeerConnection;
  private localStream?: MediaStream;

  /** Queue for ICE candidates that arrive before remote description is set */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private targetUserId: string | null = null;

  /** Timer that expires an unanswered KNOCK so the UI never hangs "calling". */
  private knockTimeoutId: any = null;
  private readonly KNOCK_TIMEOUT_MS = 30000;

  remoteStream = signal<MediaStream | null>(null);
  isCallActive = signal(false);
  callState = signal<'idle' | 'calling' | 'ringing' | 'connected' | 'failed'>(
    'idle'
  );
  isKnocking = signal(false);
  knockFromUserId = signal<string | null>(null);
  micPermissionDenied = signal(false);
  isMuted = signal(false);
  voiceActivityLevel = signal(0);

  private analyserNode: AnalyserNode | null = null;
  private activityInterval: any = null;

  async startCall(toUserId: string) {
    this.callState.set('calling');
    this.targetUserId = toUserId;
    this.social.sendVoiceSignal(toUserId, { type: 'KNOCK' });
    this.isCallActive.set(true);
    // Auto-expire unanswered knocks so the caller's UI doesn't sit on
    // "calling" forever when the callee is away or offline.
    this.clearKnockTimeout();
    this.knockTimeoutId = setTimeout(() => {
      this.knockTimeoutId = null;
      if (this.callState() === 'calling' || this.callState() === 'ringing') {
        this.callState.set('idle');
        this.isCallActive.set(false);
        this.targetUserId = null;
      }
    }, this.KNOCK_TIMEOUT_MS);
  }

  private clearKnockTimeout(): void {
    if (this.knockTimeoutId !== null) {
      clearTimeout(this.knockTimeoutId);
      this.knockTimeoutId = null;
    }
  }

  async handleSignal(fromUserId: string, data: any) {
    if (data.type === 'KNOCK') {
      this.knockFromUserId.set(fromUserId);
      this.isKnocking.set(true);
      this.callState.set('ringing');
      return;
    }

    if (data.type === 'KNOCK_ACCEPTED') {
      try {
        this.clearKnockTimeout();
        await this.initializePeerConnection(fromUserId);
        const offer = await this.peerConnection!.createOffer();
        await this.peerConnection!.setLocalDescription(offer);
        this.social.sendVoiceSignal(fromUserId, { offer });
      } catch (err) {
        console.error(
          '[Peer] Failed to create offer after knock accepted',
          err
        );
        this.callState.set('failed');
        this.isCallActive.set(false);
      }
      return;
    }

    if (data.type === 'KNOCK_DECLINED') {
      this.callState.set('idle');
      this.endCall();
      return;
    }

    if (!this.peerConnection) {
      try {
        await this.initializePeerConnection(fromUserId);
      } catch (err) {
        console.error('[Peer] Failed to initialize peer connection', err);
        this.callState.set('failed');
        return;
      }
    }

    try {
      if (data.offer) {
        await this.peerConnection!.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );
        this.flushPendingCandidates();
        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);
        this.social.sendVoiceSignal(fromUserId, { answer });
        this.isCallActive.set(true);
        this.callState.set('connected');
      } else if (data.answer) {
        this.clearKnockTimeout();
        await this.peerConnection!.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        this.flushPendingCandidates();
        this.callState.set('connected');
      } else if (data.candidate) {
        // Queue if remote description not yet set, otherwise add immediately
        if (this.peerConnection!.remoteDescription) {
          await this.peerConnection!.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        } else {
          this.pendingCandidates.push(data.candidate);
        }
      }
    } catch (err) {
      console.error('[Peer] Error handling signal', err);
    }
  }

  /** Flush any ICE candidates that were queued before remote description arrived */
  private async flushPendingCandidates() {
    for (const candidate of this.pendingCandidates) {
      try {
        await this.peerConnection?.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (err) {
        console.warn('[Peer] Failed to add queued ICE candidate', err);
      }
    }
    this.pendingCandidates = [];
  }

  async acceptKnock() {
    const fromUserId = this.knockFromUserId();
    if (!fromUserId) return;

    this.isKnocking.set(false);
    this.knockFromUserId.set(null);
    this.targetUserId = fromUserId;
    this.clearKnockTimeout();
    try {
      await this.initializePeerConnection(fromUserId);
      this.social.sendVoiceSignal(fromUserId, { type: 'KNOCK_ACCEPTED' });
      this.isCallActive.set(true);
      // Not connected yet — the caller still has to answer with an SDP
      // offer. Reporting 'connected' here would show a live uplink before
      // any media path exists.
      this.callState.set('calling');
    } catch (err) {
      console.error('[Peer] Failed to accept knock', err);
      this.callState.set('failed');
    }
  }

  declineKnock() {
    const fromUserId = this.knockFromUserId();
    if (fromUserId) {
      this.social.sendVoiceSignal(fromUserId, { type: 'KNOCK_DECLINED' });
    }
    this.isKnocking.set(false);
    this.knockFromUserId.set(null);
    this.callState.set('idle');
  }

  private async initializePeerConnection(targetUserId: string) {
    this.targetUserId = targetUserId;
    this.pendingCandidates = [];

    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    });

    // Monitor connection state for disconnects/failures
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (state === 'connected') {
        this.clearKnockTimeout();
        this.callState.set('connected');
      } else if (
        state === 'disconnected' ||
        state === 'failed' ||
        state === 'closed'
      ) {
        this.callState.set('failed');
        // Auto-cleanup on failure
        if (state === 'failed' || state === 'closed') {
          setTimeout(() => this.endCall(), 1000);
        }
      }
    };

    try {
      this.micPermissionDenied.set(false);
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch (err: any) {
      this.micPermissionDenied.set(true);
      this.callState.set('failed');
      console.error('[Peer] Microphone access denied', err);
      throw err; // Re-throw so callers can handle
    }

    this.localStream.getTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.localStream!);
    });

    // ── Voice Activity Analyser ──
    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(this.localStream!);
      this.analyserNode = audioCtx.createAnalyser();
      this.analyserNode.fftSize = 256;
      source.connect(this.analyserNode);

      // Poll analyser for volume levels
      const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.activityInterval = setInterval(() => {
        if (!this.analyserNode) return;
        this.analyserNode.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        // Normalize to 0-100 (typical mic peaks around 60-80)
        const level = Math.min(100, Math.round((avg / 80) * 100));
        this.voiceActivityLevel.set(this.isMuted() ? 0 : level);
      }, 100);
    } catch {
      // Analyser not available — voice activity stays at 0
    }

    this.peerConnection.ontrack = (event) => {
      this.remoteStream.set(event.streams[0]);
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.social.sendVoiceSignal(targetUserId, {
          candidate: event.candidate,
        });
      }
    };
  }

  toggleMute(): void {
    const next = !this.isMuted();
    this.isMuted.set(next);
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    if (next) this.voiceActivityLevel.set(0);
  }

  /** Whether the current user is actively speaking (level > threshold) */
  get isSpeaking(): boolean {
    return this.voiceActivityLevel() > 15;
  }

  endCall() {
    this.clearKnockTimeout();
    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }
    this.analyserNode = null;
    this.voiceActivityLevel.set(0);
    this.peerConnection?.close();
    this.peerConnection = undefined;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = undefined;
    this.pendingCandidates = [];
    this.remoteStream.set(null);
    this.isCallActive.set(false);
    this.isKnocking.set(false);
    this.knockFromUserId.set(null);
    this.callState.set('idle');
    this.micPermissionDenied.set(false);
    this.isMuted.set(false);
    this.targetUserId = null;
  }
}
