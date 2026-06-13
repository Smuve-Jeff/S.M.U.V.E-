import { Injectable, inject, signal } from '@angular/core';
import { SocialNetworkingService } from './social-networking.service';

@Injectable({ providedIn: 'root' })
export class PeerNetworkingService {
  private social = inject(SocialNetworkingService);
  private peerConnection?: RTCPeerConnection;
  private localStream?: MediaStream;

  remoteStream = signal<MediaStream | null>(null);
  isCallActive = signal(false);

  async startCall(toUserId: string) {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.localStream.getTracks().forEach(track => {
      this.peerConnection?.addTrack(track, this.localStream!);
    });

    this.peerConnection.ontrack = (event) => {
      this.remoteStream.set(event.streams[0]);
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.social.sendVoiceSignal(toUserId, { candidate: event.candidate });
      }
    };

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.social.sendVoiceSignal(toUserId, { offer });
    this.isCallActive.set(true);
  }

  async handleSignal(fromUserId: string, data: any) {
    if (!this.peerConnection) {
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.peerConnection.ontrack = (event) => {
            this.remoteStream.set(event.streams[0]);
        };

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.social.sendVoiceSignal(fromUserId, { candidate: event.candidate });
            }
        };
    }

    if (data.offer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.localStream.getTracks().forEach(track => {
            this.peerConnection?.addTrack(track, this.localStream!);
        });
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.social.sendVoiceSignal(fromUserId, { answer });
        this.isCallActive.set(true);
    } else if (data.answer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  endCall() {
    this.peerConnection?.close();
    this.peerConnection = undefined;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.remoteStream.set(null);
    this.isCallActive.set(false);
  }
}
