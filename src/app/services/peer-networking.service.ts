import { Injectable, inject, signal } from '@angular/core';
import { SocialNetworkingService } from './social-networking.service';

@Injectable({ providedIn: 'root' })
export class PeerNetworkingService {
  private social = inject(SocialNetworkingService);
  private peerConnection?: RTCPeerConnection;
  private localStream?: MediaStream;

  remoteStream = signal<MediaStream | null>(null);
  isCallActive = signal(false);
  isKnocking = signal(false);
  knockFromUserId = signal<string | null>(null);

  async startCall(toUserId: string) {
    // Hybrid "Knock to Enter" - Request permission first
    console.log(`Knocking for user: ${toUserId}`);
    this.social.sendVoiceSignal(toUserId, { type: 'KNOCK' });
    this.isCallActive.set(true); // UI state showing waiting
  }

  async handleSignal(fromUserId: string, data: any) {
    if (data.type === 'KNOCK') {
        this.knockFromUserId.set(fromUserId);
        this.isKnocking.set(true);
        return;
    }

    if (data.type === 'KNOCK_ACCEPTED') {
        await this.initializePeerConnection(fromUserId);
        const offer = await this.peerConnection!.createOffer();
        await this.peerConnection!.setLocalDescription(offer);
        this.social.sendVoiceSignal(fromUserId, { offer });
        return;
    }

    if (data.type === 'KNOCK_DECLINED') {
        this.endCall();
        return;
    }

    if (!this.peerConnection) {
        await this.initializePeerConnection(fromUserId);
    }

    if (data.offer) {
        await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);
        this.social.sendVoiceSignal(fromUserId, { answer });
        this.isCallActive.set(true);
    } else if (data.answer) {
        await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate) {
        await this.peerConnection!.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  async acceptKnock() {
    const fromUserId = this.knockFromUserId();
    if (!fromUserId) return;

    this.isKnocking.set(false);
    this.knockFromUserId.set(null);
    await this.initializePeerConnection(fromUserId);
    this.social.sendVoiceSignal(fromUserId, { type: 'KNOCK_ACCEPTED' });
    this.isCallActive.set(true);
  }

  declineKnock() {
    const fromUserId = this.knockFromUserId();
    if (fromUserId) {
        this.social.sendVoiceSignal(fromUserId, { type: 'KNOCK_DECLINED' });
    }
    this.isKnocking.set(false);
    this.knockFromUserId.set(null);
  }

  private async initializePeerConnection(targetUserId: string) {
    this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Failed to acquire microphone:', err);
      this.peerConnection.close();
      this.peerConnection = undefined;
      throw err;
    }
    this.localStream.getTracks().forEach(track => {
        this.peerConnection?.addTrack(track, this.localStream!);
    });

    this.peerConnection.ontrack = (event) => {
        this.remoteStream.set(event.streams[0]);
    };

    this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            this.social.sendVoiceSignal(targetUserId, { candidate: event.candidate });
        }
    };
  }

  endCall() {
    this.peerConnection?.close();
    this.peerConnection = undefined;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.remoteStream.set(null);
    this.isCallActive.set(false);
    this.isKnocking.set(false);
    this.knockFromUserId.set(null);
  }
}
