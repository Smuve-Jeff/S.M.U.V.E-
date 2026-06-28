import { APP_SECURITY_CONFIG } from '../app.security';
import { Injectable, inject, signal, effect } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { Injector } from '@angular/core';
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { PeerNetworkingService } from './peer-networking.service';
import { io, Socket } from 'socket.io-client';

export interface OnlineUser {
  userId: string;
  artistName?: string;
  primaryGenre?: string;
  avatarImage?: string;
  inGame?: boolean;
  profileSetupCompleted?: boolean;
}

export interface PrivateMessage {
  fromUserId: string;
  fromUserName?: string;
  toUserId?: string;
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
  fromUserName?: string;
  gameId: string;
  timestamp: number;
  status?: 'pending' | 'accepted' | 'declined';
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
  private injector = inject(Injector);
  private http = inject(HttpClient);

  onlineUsers = signal<OnlineUser[]>([]);
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
  matchmakingStatus = signal<"idle" | "searching" | "matched">("idle");
  currentMatch = signal<{ opponentId: string, gameId: string } | null>(null);

  // Voice chat state
  remoteSignals = signal<any[]>([]);
  typingUsers = signal<Record<string, boolean>>({});
  isIncognito = signal(false);

  private currentRoomId: string | null = null;
  private get peerService() { return this.injector.get(PeerNetworkingService); }

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
    const backendUrl = APP_SECURITY_CONFIG.api_url.replace('/api', '');
    this.socket = io(backendUrl);

    this.socket.on('connect', () => {
      console.log('Elite socket connected');
      const profile = this.profileService.profile();
      this.socket?.emit('register_presence', {
        userId,
        metadata: this.isIncognito() ? { artistName: 'Incognito', profileSetupCompleted: false } : {
          artistName: profile.artistName,
          primaryGenre: profile.primaryGenre,
          avatarImage: profile.avatarImage,
          profileSetupCompleted: profile.profileSetupCompleted
        }
      });
      if (this.currentRoomId) {
        this.socket?.emit('join_room', this.currentRoomId);
      }
    });

    this.socket.on('users_online', (users: OnlineUser[]) => {      if (!Array.isArray(users)) {        this.onlineUsers.set([]);        return;      }      if (this.isIncognito()) {        this.onlineUsers.set([]);      } else {        this.onlineUsers.set(users.filter(u => u.userId !== userId && u.artistName !== 'Incognito'));      }    });

    this.socket.on('private_message', (data: any) => {
      this.messages.update(msgs => [...msgs, { ...data, timestamp: Date.now() }]);
    });

    this.socket.on('room_message', (data: any) => {
      this.roomMessages.update(msgs => [...msgs, data]);
    });

    this.socket.on('incoming_challenge', (data: any) => {
      this.challenges.update(challs => [...challs, { ...data, timestamp: Date.now(), status: 'pending' }]);
    });

    this.socket.on("match_found", (data: any) => {
      this.matchmakingStatus.set("matched");
      this.currentMatch.set(data);
    });
    this.socket.on("user_typing", (data: any) => {
      this.typingUsers.update(users => ({ ...users, [data.fromUserId]: data.isTyping }));
    });
    this.socket.on('voice_signal', (data: any) => {
      this.remoteSignals.update(sigs => [...sigs, data]);
      this.peerService.handleSignal(data.fromUserId, data.signal);
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

  sendTypingStatus(toUserId: string, isTyping: boolean) {
    const fromUserId = this.profileService.profile().id;
    this.socket?.emit("typing", { toUserId, isTyping, fromUserId });
  }
  updateStatus(metadata: any) {
    const userId = this.profileService.profile().id; if (!userId) return;
    this.socket?.emit("update_status", { userId, metadata });
  }
  sendMessage(toUserId: string, message: string) {
    const fromUserId = this.profileService.profile().id;
    const fromUserName = this.profileService.profile().artistName;
    this.socket?.emit('send_message', { toUserId, message, fromUserId, fromUserName });
    this.messages.update(msgs => [...msgs, { fromUserId, fromUserName, toUserId, message, timestamp: Date.now() }]);
  }

  challengePlayer(toUserId: string, gameId: string) {
    const fromUserId = this.profileService.profile().id;
    const fromUserName = this.profileService.profile().artistName;
    this.socket?.emit('challenge_player', { toUserId, fromUserId, fromUserName, gameId });
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
    const fans = ['EliteGamer', 'SMUVE_Fan_99', 'BeatMaker_Pro', 'VibeCheck', 'Rival_Zero', 'StreamSnip3r', 'Lurker_One', 'GiftingSubz', 'ChatMod_Alpha'];
    const comments = [
      'This track is fire!',
      'How do you get that snare sound?',
      'Elite skills right here.',
      'S.M.U.V.E 2.0 looking clean!',
      'Challenge me next?',
      'Wait, is this live??',
      'Big vibes!',
      'LFG!', 'Is this on Kick too?', 'Tiktok fam where you at?', 'Clip that!!', 'The Absolute goat', 'Streaming quality is insane', 'Discord link?'
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

  async searchUsers(query: string): Promise<OnlineUser[]> {
    try {
      return await firstValueFrom(this.http.get<OnlineUser[]>(
        `${APP_SECURITY_CONFIG.api_url}/users/search`,
        {
          params: { q: query }
        }
      ));
    } catch (e) {
      return [];
    }
  }

  async getFeaturedUsers(): Promise<OnlineUser[]> {
    try {
      return await firstValueFrom(this.http.get<OnlineUser[]>(`${APP_SECURITY_CONFIG.api_url}/users/featured`));
    } catch (e) {
      return [];
    }
  }

  queueForMatch(gameId: string) {
    const userId = this.profileService.profile().id; if (!userId) return;
    this.matchmakingStatus.set("searching");
    this.socket?.emit("queue_for_match", { userId, gameId });
  }

  cancelMatch(gameId: string) {
    const userId = this.profileService.profile().id; if (!userId) return;
    this.matchmakingStatus.set("idle");
    this.socket?.emit("cancel_match", { userId, gameId });
  }
  toggleIncognito() {
    this.isIncognito.update(v => !v);
    const profile = this.profileService.profile();
    this.socket?.emit('register_presence', {
      userId: profile.id,
      metadata: this.isIncognito() ? { artistName: 'Incognito', profileSetupCompleted: false } : {
        artistName: profile.artistName,
        primaryGenre: profile.primaryGenre,
        avatarImage: profile.avatarImage,
        profileSetupCompleted: profile.profileSetupCompleted
      }
    });
    if (this.isIncognito()) {
      this.onlineUsers.set([]);
    }
  }
}