import { APP_SECURITY_CONFIG } from '../app.security';
import { Injectable, inject, signal, effect } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { Injector } from '@angular/core';
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { PeerNetworkingService } from './peer-networking.service';
import { io, Socket } from 'socket.io-client';
import { TokenService } from './token.service';

export interface OnlineUser {
  userId: string;
  artistName?: string;
  primaryGenre?: string;
  avatarImage?: string;
  inGame?: boolean;
  profileSetupCompleted?: boolean;
  online?: boolean;
  location?: string;
  eliteScore?: number;
  squadCount?: number;
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
  private tokenService = inject(TokenService);

  onlineUsers = signal<OnlineUser[]>([]);
  messages = signal<PrivateMessage[]>([]);
  roomMessages = signal<RoomMessage[]>([]);
  challenges = signal<Challenge[]>([]);
  friends = signal<OnlineUser[]>([]);
  partyMembers = signal<OnlineUser[]>([]);
  activeHubTab = signal<'room' | 'dm' | 'stream' | 'friends' | 'party'>('room');
  currentPartyId = signal<string | null>(null);

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

  neuralSyncStatus = signal<'idle' | 'syncing' | 'synced'>('idle');
  lastSyncedData = signal<any>(null);
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
          location: profile.location,
          profileSetupCompleted: profile.profileSetupCompleted
        }
      });
      if (this.currentRoomId) {
        this.socket?.emit('join_room', this.currentRoomId);
      }
    });

    this.socket.on('users_online', (users: OnlineUser[]) => {
      if (!Array.isArray(users)) {
        this.onlineUsers.set([]);
        return;
      }
      if (this.isIncognito()) {
        this.onlineUsers.set([]);
      } else {
        this.onlineUsers.set(
          users.filter((u) => u.userId !== userId && u.artistName !== 'Incognito'),
        );
      }
    });


    this.socket.on("neural_sync_invite", (data: any) => {
      if (confirm(`INCOMING NEURAL SYNC REQUEST FROM ${data.fromUserName}. PROCEED?`)) {
        const currentProfile = this.profileService.profile(); this.socket?.emit("neural_sync_approve", { toUserId: data.fromUserId, fromUserId: userId, fromUserName: currentProfile.artistName, syncData: { eliteScore: (currentProfile as any).eliteScore, squadCount: (currentProfile as any).squadCount } });
      }
    });

    this.socket.on("neural_sync_complete", (data: any) => {
      this.neuralSyncStatus.set("synced");
      this.lastSyncedData.set({ syncedWith: data.fromUserName, timestamp: Date.now(), remoteData: data.syncData });
      console.log("Neural sync finalized with", data.fromUserName, data.syncData);
    });

    this.socket.on("message", (data: any) => {
      this.messages.update(msgs => [...msgs, data]);
    });
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

    this.socket.on("party_created", (data: any) => {
      this.currentPartyId.set(data.partyId);
      this.partyMembers.set([{ userId: data.leaderId, artistName: this.profileService.profile().artistName }]);
    });

    this.socket.on("user_joined_party", (data: any) => {
      this.partyMembers.update(members => {
        if (!members.find(m => m.userId === data.userId)) {
          return [...members, { userId: data.userId, artistName: data.artistName }];
        }
        return members;
      });
    });


    this.socket.on("party_invite", (data: any) => {
      if (confirm(`INCOMING SQUAD INVITE FROM ${data.fromUserName}. JOIN SQUAD?`)) {
        this.joinParty(data.partyId);
        this.activeHubTab.set('party');
      }
    });
    this.socket.on("user_left_party", (data: any) => {
      this.partyMembers.update(members => members.filter(m => m.userId !== data.userId));
    });

    this.socket.on('party_message', (data: any) => {
      this.roomMessages.update((msgs) => [...msgs, data]);
    });

    this.socket.on('party_launch_game', (data: any) => {
      if (typeof data?.gameId !== 'string') return;
      this.roomMessages.update((msgs) => [
        ...msgs,
        {
          roomId: 'party',
          fromUserId: 'system',
          fromUserName: 'SQUAD_COMMAND',
          message: `SQUAD_LEADER_LAUNCHING: ${data.gameId.toUpperCase()}. PREPARE_FOR_JOINT_MISSION.`,
          timestamp: Date.now(),
          metadata: { type: 'GAME_INVITE', gameId: data.gameId },
        },
      ]);
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
    const userId = this.profileService.profile().id;
    if (!userId) return;
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

  startTwitchAuth() {
    const width = 500, height = 600;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    const url = `${APP_SECURITY_CONFIG.api_url}/auth/twitch`;

    const popup = window.open(url, 'Twitch Auth', `width=${width},height=${height},left=${left},top=${top}`);

    window.addEventListener('message', (event) => {
      if (event.data.type === 'TWITCH_AUTH_SUCCESS') {
        console.log('Twitch connected successfully');
        this.currentPlatform.set('Twitch (Connected)');
      }
    }, { once: true });
  }
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



  requestNeuralSync(toUserId: string) {
    const profile = this.profileService.profile();
    this.neuralSyncStatus.set("syncing");
    this.socket?.emit("neural_sync_request", {
      toUserId,
      fromUserId: profile.id,
      fromUserName: profile.artistName,
      syncType: 'FULL_DASHBOARD'
    });
  }

  async loadMessageHistory(friendId: string) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const history = await firstValueFrom(this.http.get<any[]>(
        `${APP_SECURITY_CONFIG.api_url}/users/${userId}/messages/${friendId}`,
        { headers }
      ));
      this.messages.set(history);
    } catch (e) {
      console.error('Failed to load message history', e);
    }
  }
  async loadFriends() {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const friends = await firstValueFrom(this.http.get<OnlineUser[]>(
        `${APP_SECURITY_CONFIG.api_url}/users/${userId}/friends`,
        { headers }
      ));
      this.friends.set(friends);
    } catch (e) {
      console.error('Failed to load friends', e);
    }
  }

  async addFriend(friendId: string) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await firstValueFrom(this.http.post(
        `${APP_SECURITY_CONFIG.api_url}/users/${userId}/friends/${friendId}`,
        {},
        { headers }
      ));
      await this.loadFriends();
    } catch (e) {
      console.error('Failed to add friend', e);
    }
  }


  async respondToFriendRequest(friendId: string, status: 'accepted' | 'declined') {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await firstValueFrom(this.http.patch(
        `${APP_SECURITY_CONFIG.api_url}/users/${userId}/friends/${friendId}`,
        { status },
        { headers }
      ));
      await this.loadFriends();
    } catch (e) {
      console.error('Failed to respond to friend request', e);
    }
  }

  async removeFriend(friendId: string) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await firstValueFrom(this.http.delete(
        `${APP_SECURITY_CONFIG.api_url}/users/${userId}/friends/${friendId}`,
        { headers }
      ));
      await this.loadFriends();
    } catch (e) {
      console.error('Failed to remove friend', e);
    }
  }

  createParty(gameId: string) {
    const profile = this.profileService.profile();
    const partyId = Math.random().toString(36).substring(7);
    this.socket?.emit("create_party", { partyId, leaderId: profile.id, gameId });
  }


  inviteToParty(toUserId: string) {
    const partyId = this.currentPartyId();
    if (!partyId) return;
    const profile = this.profileService.profile();
    this.socket?.emit("invite_to_party", {
      toUserId,
      partyId,
      fromUserId: profile.id,
      fromUserName: profile.artistName,
      gameId: 'global'
    });
  }
  joinParty(partyId: string) {
    const profile = this.profileService.profile();
    this.socket?.emit("join_party", { partyId, userId: profile.id, artistName: profile.artistName });
    this.currentPartyId.set(partyId);
  }

  leaveParty() {
    const partyId = this.currentPartyId();
    if (!partyId) return;
    const profile = this.profileService.profile();
    this.socket?.emit("leave_party", { partyId, userId: profile.id, artistName: profile.artistName });
    this.currentPartyId.set(null);
  }


  launchPartyGame(gameId: string) {
    const partyId = this.currentPartyId();
    if (!partyId) return;
    this.socket?.emit("party_launch_game", { partyId, gameId });
  }

  sendPartyMessage(message: string) {
    const partyId = this.currentPartyId();
    if (!partyId) return;
    const profile = this.profileService.profile();
    this.socket?.emit("send_party_message", { partyId, message, fromUserId: profile.id, fromUserName: profile.artistName });
  }

  async searchUsers(query: string): Promise<OnlineUser[]> {
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      return await firstValueFrom(this.http.get<OnlineUser[]>(
        `${APP_SECURITY_CONFIG.api_url}/users/search`,
        {
          params: { q: query, location: query },
          headers
        }
      ));
    } catch (e) {
      return [];
    }
  }

  async getFeaturedUsers(): Promise<OnlineUser[]> {
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      return await firstValueFrom(this.http.get<OnlineUser[]>(`${APP_SECURITY_CONFIG.api_url}/users/featured`, { headers }));
    } catch (e) {
      return [];
    }
  }

  queueForMatch(gameId: string) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    this.matchmakingStatus.set("searching");
    this.socket?.emit("queue_for_match", { userId, gameId });
  }

  cancelMatch(gameId: string) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
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
          location: profile.location,
        profileSetupCompleted: profile.profileSetupCompleted
      }
    });
    if (this.isIncognito()) {
      this.onlineUsers.set([]);
    }
  }
}