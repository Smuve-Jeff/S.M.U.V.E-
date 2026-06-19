import { Injectable, inject, signal, effect } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { io, Socket } from 'socket.io-client';

export interface PrivateMessage {
  fromUserId: string;
  fromUserName?: string;
  message: string;
  timestamp: number;
}

export interface RoomMessage {
  roomId: string;
  fromUserId: string;
  fromUserName?: string;
  message: string;
  timestamp: number;
}

export interface Challenge {
  fromUserId: string;
  gameId: string;
  timestamp: number;
}

export interface StreamTelemetry {
  viewers: number;
  health: 'Good' | 'Fair' | 'Poor';
  platform: string;
  bitrate: string;
}

@Injectable({ providedIn: 'root' })
export class SocialNetworkingService {
  private profileService = inject(UserProfileService);
  private socket?: Socket;

  onlineUsers = signal<string[]>([]);
  messages = signal<PrivateMessage[]>([]);
  roomMessages = signal<RoomMessage[]>([]);
  challenges = signal<Challenge[]>([]);

  // Go Live State
  isStreaming = signal(false);
  currentPlatform = signal<string | null>(null);
  streamTelemetry = signal<StreamTelemetry>({
    viewers: 0,
    health: 'Good',
    platform: 'NONE',
    bitrate: '0 kbps'
  });
  simulatedLiveChat = signal<RoomMessage[]>([]);

  // Voice chat state
  remoteSignals = signal<any[]>([]);

  private currentRoomId: string | null = null;


  private getSecureRandom(): number {
    const array = new Uint32Array(1);
    (window as any).crypto.getRandomValues(array);
    return array[0] / (0xffffffff + 1);
  }

  constructor() {
    effect(() => {
      const profile = this.profileService.profile();
      if (profile.id && !this.socket) {
        this.initializeSocket(profile.id);
      }
    });
  }

  private initializeSocket(userId: string) {
    const backendUrl = window.location.origin;
    this.socket = io(backendUrl);

    this.socket.on('connect', () => {
      console.log('Elite socket connected');
      this.socket?.emit('register_presence', userId);
      if (this.currentRoomId) {
        this.socket?.emit('join_room', this.currentRoomId);
      }
    });

    this.socket.on('users_online', (users: string[]) => {
      this.onlineUsers.set(users.filter(u => u !== userId));
    });

    this.socket.on('private_message', (data: any) => {
      this.messages.update(msgs => [...msgs, { ...data, timestamp: Date.now() }]);
    });

    this.socket.on('room_message', (data: any) => {
      this.roomMessages.update(msgs => [...msgs, data]);
    });

    this.socket.on('incoming_challenge', (data: any) => {
      this.challenges.update(challs => [...challs, { ...data, timestamp: Date.now() }]);
    });

    this.socket.on('voice_signal', (data: any) => {
      this.remoteSignals.update(sigs => [...sigs, data]);
    });
  }

  joinRoom(roomId: string) {
    this.currentRoomId = roomId;
    this.roomMessages.set([]);
    this.socket?.emit('join_room', roomId);
  }

  sendRoomMessage(roomId: string, message: string) {
    const fromUserId = this.profileService.profile().id;
    const fromUserName = this.profileService.profile().artistName;
    this.socket?.emit('send_room_message', { roomId, message, fromUserId, fromUserName });
  }

  sendMessage(toUserId: string, message: string) {
    const fromUserId = this.profileService.profile().id;
    const fromUserName = this.profileService.profile().artistName;
    this.socket?.emit('send_message', { toUserId, message, fromUserId, fromUserName });
    // Optimistic local add
    this.messages.update(msgs => [...msgs, { fromUserId, fromUserName, message, timestamp: Date.now() }]);
  }

  challengePlayer(toUserId: string, gameId: string) {
    const fromUserId = this.profileService.profile().id;
    this.socket?.emit('challenge_player', { toUserId, fromUserId, gameId });
  }

  sendVoiceSignal(toUserId: string, signal: any) {
    const fromUserId = this.profileService.profile().id;
    this.socket?.emit('voice_signal', { toUserId, signal, fromUserId });
  }

  // STREAMING LOGIC
  private streamInterval?: any;
  startStream(platform: string) {
    this.isStreaming.set(true);
    this.currentPlatform.set(platform);
    this.simulatedLiveChat.set([]);

    this.streamInterval = setInterval(() => {
      this.updateStreamTelemetry(platform);
      if (this.getSecureRandom() > 0.6) {
        this.generateSimulatedComment();
      }
    }, 3000);
  }

  stopStream() {
    this.isStreaming.set(false);
    this.currentPlatform.set(null);
    if (this.streamInterval) clearInterval(this.streamInterval);
  }

  private updateStreamTelemetry(platform: string) {
    this.streamTelemetry.update(t => ({
      ...t,
      platform,
      viewers: t.viewers + Math.floor(this.getSecureRandom() * 5),
      bitrate: `${5500 + Math.floor(this.getSecureRandom() * 500)} kbps`,
      health: this.getSecureRandom() > 0.9 ? 'Fair' : 'Good'
    }));
  }

  private generateSimulatedComment() {
    const fans = ['EliteGamer', 'SMUVE_Fan_99', 'BeatMaker_Pro', 'VibeCheck', 'Rival_Zero'];
    const comments = [
      'This track is fire!',
      'How do you get that snare sound?',
      'Elite skills right here.',
      'S.M.U.V.E 2.0 looking clean!',
      'Challenge me next?',
      'Wait, is this live??',
      'Big vibes!',
      'LFG!'
    ];

    const newComment: RoomMessage = {
      roomId: 'simulated',
      fromUserId: 'fan',
      fromUserName: fans[Math.floor(this.getSecureRandom() * fans.length)],
      message: comments[Math.floor(this.getSecureRandom() * comments.length)],
      timestamp: Date.now()
    };

    this.simulatedLiveChat.update(msgs => {
      const updated = [...msgs, newComment];
      return updated.slice(-10); // Keep last 10
    });
  }
}
