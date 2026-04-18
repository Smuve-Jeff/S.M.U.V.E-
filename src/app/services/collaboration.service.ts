import { LoggingService } from './logging.service';
import { Injectable, signal, inject } from '@angular/core';
import { AuthUser } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CollaborationService {
  private logger = inject(LoggingService);
  private peers: { [key: string]: RTCPeerConnection } = {};
  private dataChannels: { [key: string]: RTCDataChannel } = {};
  currentSession = signal<any>(null);

  async startSession(_user: AuthUser, projectState: any): Promise<string> {
    const sessionId = this.generateSecureId();
    this.logger.system(`INITIALIZING WEBRTC P2P SESSION: ${sessionId}`);
    this.currentSession.set({ sessionId, participants: [_user], projectState });
    return sessionId;
  }

  async joinSession(sessionId: string, _user: AuthUser): Promise<void> {
    this.logger.system(`JOINING P2P COLLABORATION SESSION: ${sessionId}`);
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    const dataChannel = peerConnection.createDataChannel('smuve-sync');
    dataChannel.onopen = () => this.logger.system('P2P DATA LINK ESTABLISHED.');
    this.peers[sessionId] = peerConnection;
    this.dataChannels[sessionId] = dataChannel;
  }

  sendProjectUpdate(sessionId: string, projectState: any): void {
    const channel = this.dataChannels[sessionId];
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify({ action: 'update', payload: projectState }));
    }
  }

  leaveSession(sessionId: string): void {
    const channel = this.dataChannels[sessionId];
    if (channel) {
      try {
        channel.close();
      } catch (_e) {
        /* ignore */
      }
      delete this.dataChannels[sessionId];
    }
    const peer = this.peers[sessionId];
    if (peer) {
      peer.close();
      delete this.peers[sessionId];
    }
    this.currentSession.set(null);
    this.logger.system(`LEFT P2P SESSION: ${sessionId}`);
  }

  private generateSecureId(): string {
    const array = new Uint32Array(4);
    window.crypto.getRandomValues(array);
    return Array.from(array, (dec) => dec.toString(16)).join('');
  }
}
