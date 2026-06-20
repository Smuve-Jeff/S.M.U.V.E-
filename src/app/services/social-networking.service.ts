import { Injectable, inject, signal, effect } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { io, Socket } from 'socket.io-client';

export interface PrivateMessage {
  fromUserId: string;
  message: string;
  timestamp: number;
}

export interface Challenge {
  fromUserId: string;
  gameId: string;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class SocialNetworkingService {
  private profileService = inject(UserProfileService);
  private socket?: Socket;

  onlineUsers = signal<string[]>([]);
  messages = signal<PrivateMessage[]>([]);
  challenges = signal<Challenge[]>([]);

  // Voice chat state
  remoteSignals = signal<any[]>([]);

  constructor() {
    effect(() => {
      const profile = this.profileService.profile();
      if (profile.id && !this.socket) {
        this.initializeSocket(profile.id);
      }
    });
  }

  private initializeSocket(userId: string) {
    // In a real env, this would be the actual backend URL
    const backendUrl = window.location.origin; // Assuming same origin for now
    this.socket = io(backendUrl);

    this.socket.on('connect', () => {
      console.log('Elite socket connected');
      this.socket?.emit('register_presence', userId);
    });

    this.socket.on('users_online', (users: string[]) => {
      this.onlineUsers.set(users.filter(u => u !== userId));
    });

    this.socket.on('private_message', (data: any) => {
      this.messages.update(msgs => [...msgs, { ...data, timestamp: Date.now() }]);
    });

    this.socket.on('incoming_challenge', (data: any) => {
      this.challenges.update(challs => [...challs, { ...data, timestamp: Date.now() }]);
    });

    this.socket.on('voice_signal', (data: any) => {
      this.remoteSignals.update(sigs => [...sigs, data]);
    });
  }

  sendMessage(toUserId: string, message: string) {
    const fromUserId = this.profileService.profile().id;
    this.socket?.emit('send_message', { toUserId, message, fromUserId });
  }

  challengePlayer(toUserId: string, gameId: string) {
    const fromUserId = this.profileService.profile().id;
    this.socket?.emit('challenge_player', { toUserId, fromUserId, gameId });
  }

  sendVoiceSignal(toUserId: string, signal: any) {
    const fromUserId = this.profileService.profile().id;
    this.socket?.emit('voice_signal', { toUserId, signal, fromUserId });
  }
}
