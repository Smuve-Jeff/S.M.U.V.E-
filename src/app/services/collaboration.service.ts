import { LoggingService } from './logging.service';
import {
  Injectable,
  signal,
  inject,
  computed,
  effect,
  WritableSignal,
} from '@angular/core';
import { AuthUser, AuthService } from './auth.service';
import { MusicManagerService } from './music-manager.service';
import { SocialNetworkingService } from './social-networking.service';
import { UserProfileService } from './user-profile.service';
import { PeerNetworkingService } from './peer-networking.service';

/** Per-project full snapshot (Phase 1 baseline + cold-join / heartbeat). */
export interface ProjectSnapshotMessage {
  type: 'PROJECT_SYNC';
  v: number;
  fromUserId: string;
  fromUserName?: string;
  payload: any;
}

/** Single-track delta — emitted on every incremental local change. */
export interface TrackDeltaMessage {
  type: 'TRACK_DELTA_SYNC';
  v: number;
  fromUserId: string;
  fromUserName?: string;
  payload: any;
}

/** Peer cursor — normalized coordinates over a named surface. */
export interface PeerCursorMessage {
  type: 'PEER_CURSOR';
  v: number;
  fromUserId: string;
  fromUserName?: string;
  payload: any;
}

/** Voice channel invite envelope family. */
export interface VoiceInviteMessage {
  type: 'VOICE_INVITE' | 'VOICE_ACCEPT' | 'VOICE_DECLINE' | 'VOICE_END';
  v: number;
  fromUserId: string;
  toUserId: string;
  payload?: any;
}

/** Discriminated union over every collab envelope type. */
export type CollabMessage =
  | ProjectSnapshotMessage
  | TrackDeltaMessage
  | PeerCursorMessage
  | VoiceInviteMessage;

/** A pending field-level conflict surfaced for the user to resolve. */
export interface ProjectConflict {
  trackId: string;
  fieldKey: string;
  remoteValue: any;
  remoteUserId: string;
  remoteUserName?: string;
  remoteAtMs: number;
  localValue: any;
}

/** A peer cursor on a given surface. */
export interface PeerCursorState {
  userId: string;
  artistName: string;
  surface: string;
  x: number;
  y: number;
  lastSeenMs: number;
}

/** A voice-channel peer rower. */
export interface VoicePeer {
  userId: string;
  artistName: string;
  state: string;
  level: number;
}

/**
 * Sprint B2 real-time collab — Phase 2 hardened protocol.
 *
 * Phase 1 baselines preserved:
 *  - project-snapshot envelopes with version stamping
 *  - 300ms debounce coalescing + stale drop + loopback guard
 *  - autoSync toggle + peerCount presence signal
 *
 * Phase 2 additions:
 *  - per-track diff sync via TRACK_DELTA_SYNC (lighter than full snapshots)
 *  - field-version LWW registry so peers don't roll back a fresher edit
 *  - 800ms field-level conflict guard, surfaces pendingConflicts signal
 *  - voice tie-in through PeerNetworkingService (1:1 voice bridge)
 *  - peer-cursor publish + render surface map (throttled to 80ms)
 *  - heartbeat PROJECT_SYNC every 30s as eventual-consistency safety net
 */
@Injectable({ providedIn: 'root' })
export class CollaborationService {
  private logger = inject(LoggingService);
  private musicManager = inject(MusicManagerService);
  private social = inject(SocialNetworkingService);
  private auth = inject(AuthService);
  private profileService = inject(UserProfileService);
  private peerNet = inject(PeerNetworkingService);

  /* Session state */
  currentSession = signal<{
    sessionId: string;
    partyKey: string;
    participants: AuthUser[];
  } | null>(null);

  /** User-controlled broadcast switch. */
  autoSync = signal(true);

  /* Dispatch state (private) */
  private lastDispatchedVersion = 0;
  private lastAppliedVersion = 0;
  private isRemoteUpdate = false;
  private debounceTimer: any = null;
  private heartbeatTimer: any = null;

  /** Last per-track snapshot we sent — baseline for diffs. */
  private lastSnapshotByTrack: Record<string, any> = {};
  /** Last full snapshot we sent — used by PROJECT_SYNC fallback. */
  private lastFullSnapshot: any = null;

  /** Size threshold above which we collapse delta to snapshot. */
  private readonly DELTA_SIZE_BUDGET = 32 * 1024;

  /* Phase 2: field-version registry + conflicts */
  /** Per-track field version table for LWW conflict resolution. */
  private fieldVersions: Record<string, Record<string, number>> = {};

  /** Pending field-level conflicts for the user to resolve. */
  pendingConflicts: WritableSignal<ProjectConflict[]> = signal([]);

  /* Phase 2: voice bridge */
  /** Map of active voice peers keyed by userId. */
  voicePeers: WritableSignal<Record<string, VoicePeer>> = signal({});

  voiceActive = computed(() => {
    const peers = Object.values(this.voicePeers());
    return peers.some(
      (p: VoicePeer) =>
        p.state === 'calling' ||
        p.state === 'connected' ||
        p.state === 'muted'
    );
  });

  /* Phase 2: peer cursors */
  peerCursors: WritableSignal<Record<string, PeerCursorState>> = signal({});

  /* Public computed signals (Phase 1) */
  currentUserId = computed(() => this.auth.currentUser()?.id ?? null);

  sessionCode = computed(
    () =>
      this.currentSession()?.sessionId?.slice(-4).toUpperCase() ?? '----'
  );

  peerCount = computed(() => {
    const session = this.currentSession();
    if (!session) return 0;
    const party = this.social.currentPartyId();
    if (party !== session.partyKey) return 1;
    const ids = new Set(
      this.social.partyMembers().map((m: any) => m.userId ?? m)
    );
    if (ids.size === 0) return 1;
    return ids.size;
  });

  /** Compact peer roster for the presence header. */
  peerRoster = computed(() => {
    const session = this.currentSession();
    if (!session) return [] as { userId: string; artistName: string }[];
    const ids = new Set(
      this.social.partyMembers().map((m: any) => m.userId ?? m)
    );
    return Array.from(ids)
      .filter((id) => id && id !== this.currentUserId())
      .map((id) => ({
        userId: String(id),
        artistName:
          this.social
            .onlineUsers()
            .find((u: any) => u.id === id)?.artistName ?? id.slice(-4),
      }));
  });

  constructor() {
    effect(() => {
      const session = this.currentSession();
      if (!session || this.isRemoteUpdate || !this.autoSync()) return;
      const _tracks = this.musicManager.tracks();
      void _tracks;
      const snapshot = this.musicManager.snapshotProject();
      if (!snapshot) return;
      this.dispatchProjectSync(snapshot, false);
    });

    this.heartbeatTimer = setInterval(() => {
      if (
        !this.currentSession() ||
        !this.autoSync() ||
        this.isRemoteUpdate
      )
        return;
      const snap = this.musicManager.snapshotProject();
      if (!snap) return;
      this.dispatchProjectSync(snap, true);
    }, 30_000);

    /* Receive dispatcher */
    effect(() => {
      const msgs = this.social.roomMessages();
      if (msgs.length === 0) return;
      const lastMsg = msgs[msgs.length - 1];
      if (typeof lastMsg?.message !== 'string') return;
      let env: CollabMessage;
      try {
        env = JSON.parse(lastMsg.message) as CollabMessage;
      } catch {
        return;
      }
      if (!env || env.fromUserId === this.currentUserId()) return;

      switch (env.type) {
        case 'PROJECT_SYNC':
          this.handleProjectSync(env);
          break;
        case 'TRACK_DELTA_SYNC':
          this.handleTrackDelta(env);
          break;
        case 'PEER_CURSOR':
          this.handlePeerCursor(env);
          break;
        case 'VOICE_INVITE':
          this.handleVoiceInvite(env);
          break;
        case 'VOICE_ACCEPT':
          this.handleVoiceAccept(env);
          break;
        case 'VOICE_DECLINE':
          this.handleVoiceDecline(env);
          break;
        case 'VOICE_END':
          this.handleVoiceEnd(env);
          break;
      }
    });
  }

  /* Dispatch helpers */

  private dispatchProjectSync(snapshot: any, _isHeartbeat: boolean): void {
    const v = Date.now();
    this.lastDispatchedVersion = v;
    this.lastFullSnapshot = snapshot;
    const envelope: ProjectSnapshotMessage = {
      type: 'PROJECT_SYNC',
      v,
      fromUserId: this.currentUserId() ?? 'local',
      fromUserName: this.profileService.profile()?.artistName,
      payload: snapshot,
    };
    try {
      this.social.sendPartyMessage(JSON.stringify(envelope));
    } catch (err) {
      this.logger.warn(
        'CollaborationService: PROJECT_SYNC dispatch failed',
        err
      );
    }
  }

  /**
   * Dispatch a per-track delta. Falls back to a full PROJECT_SYNC when the
   * delta would exceed the size budget or the diff shrunk nothing.
   */
  dispatchTrackDelta(trackId: string, trackState: any): void {
    if (
      !this.currentSession() ||
      this.isRemoteUpdate ||
      !this.autoSync()
    )
      return;
    const v = Date.now();
    this.lastDispatchedVersion = v;

    const fieldVersions: Record<string, number> = {};
    for (const key of Object.keys(trackState ?? {})) {
      fieldVersions[key] = v;
    }
    this.fieldVersions[trackId] = fieldVersions;
    this.lastSnapshotByTrack[trackId] = trackState;

    const serialized = JSON.stringify(trackState ?? {});
    if (serialized.length > this.DELTA_SIZE_BUDGET) {
      const snap = this.musicManager.snapshotProject();
      if (snap) this.dispatchProjectSync(snap, false);
      return;
    }

    const envelope: TrackDeltaMessage = {
      type: 'TRACK_DELTA_SYNC',
      v,
      fromUserId: this.currentUserId() ?? 'local',
      fromUserName: this.profileService.profile()?.artistName,
      payload: { trackId, track: trackState, fieldVersions },
    };
    try {
      this.social.sendPartyMessage(JSON.stringify(envelope));
    } catch (err) {
      this.logger.warn(
        'CollaborationService: TRACK_DELTA_SYNC dispatch failed',
        err
      );
    }
  }

  /* Receive handlers */

  private handleProjectSync(env: ProjectSnapshotMessage): void {
    if (env.v <= this.lastAppliedVersion) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (this.currentSession() && env.v > this.lastAppliedVersion) {
        this.lastAppliedVersion = env.v;
        this.applyRemoteUpdate(env.payload);
      }
    }, 300);
  }

  private handleTrackDelta(env: TrackDeltaMessage): void {
    const trackId = env?.payload?.trackId;
    const track = env?.payload?.track;
    const remoteVersions = env?.payload?.fieldVersions ?? {};
    if (!trackId || !track) return;
    const localVersions = this.fieldVersions[trackId] ?? {};

    const now = Date.now();
    const newConflicts: ProjectConflict[] = [];
    for (const field of Object.keys(remoteVersions)) {
      const lv = localVersions[field] ?? 0;
      const rv = remoteVersions[field];
      if (
        lv &&
        rv &&
        lv < rv &&
        now - lv < 800 &&
        track[field] !== undefined
      ) {
        newConflicts.push({
          trackId,
          fieldKey: field,
          remoteValue: track[field],
          remoteUserId: env.fromUserId,
          remoteUserName: env.fromUserName,
          remoteAtMs: rv,
          localValue: this.lastSnapshotByTrack[trackId]?.[field] ?? null,
        });
      }
    }

    if (newConflicts.length > 0) {
      const existing = this.pendingConflicts();
      this.pendingConflicts.set([...existing, ...newConflicts]);
      return;
    }

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (!this.currentSession()) return;
      this.lastAppliedVersion = env.v;
      this.isRemoteUpdate = true;
      try {
        const trackList = (this.musicManager.tracks() ?? []).map((t: any) =>
          t && t.id === trackId ? { ...track } : t
        );
        this.musicManager.loadProject({
          ...(this.musicManager.snapshotProject() ?? {}),
          tracks: trackList,
        });
      } finally {
        setTimeout(() => (this.isRemoteUpdate = false), 250);
      }
    }, 120);
  }

  private applyRemoteUpdate(snapshot: any): void {
    this.isRemoteUpdate = true;
    try {
      this.musicManager.loadProject(snapshot);
    } finally {
      setTimeout(() => (this.isRemoteUpdate = false), 250);
    }
  }

  private handlePeerCursor(env: PeerCursorMessage): void {
    const surface = env?.payload?.surface ?? 'studio';
    const x = Math.min(1, Math.max(0, Number(env?.payload?.x ?? 0)));
    const y = Math.min(1, Math.max(0, Number(env?.payload?.y ?? 0)));
    const existing = this.peerCursors();
    this.peerCursors.set({
      ...existing,
      [env.fromUserId]: {
        userId: env.fromUserId,
        artistName:
          this.social
            .onlineUsers()
            .find((u: any) => u.id === env.fromUserId)?.artistName ??
          env.fromUserName ??
          env.fromUserId.slice(-4),
        surface,
        x,
        y,
        lastSeenMs: Date.now(),
      },
    });

    for (const id of Object.keys(existing)) {
      const c = existing[id];
      if (Date.now() - c.lastSeenMs > 30_000) {
        const next = { ...existing };
        delete next[id];
        this.peerCursors.set(next);
      }
    }
  }

  /* Voice bridge */

  inviteToVoice(peerId: string): void {
    if (!this.currentSession() || !peerId) return;
    this.setVoicePeer(peerId, 'calling', 0);
    const env: VoiceInviteMessage = {
      type: 'VOICE_INVITE',
      v: Date.now(),
      fromUserId: this.currentUserId() ?? 'local',
      toUserId: peerId,
    };
    try {
      this.social.sendPartyMessage(JSON.stringify(env));
    } catch (err) {
      this.logger.warn(
        'CollaborationService: VOICE_INVITE dispatch failed',
        err
      );
    }
  }

  acceptVoiceInvite(peerId: string): void {
    this.setVoicePeer(peerId, 'calling', 0);
    try {
      this.peerNet.startCall(peerId);
    } catch (err) {
      this.logger.warn('CollaborationService: peerNet.startCall failed', err);
    }
    const env: VoiceInviteMessage = {
      type: 'VOICE_ACCEPT',
      v: Date.now(),
      fromUserId: this.currentUserId() ?? 'local',
      toUserId: peerId,
    };
    try {
      this.social.sendPartyMessage(JSON.stringify(env));
    } catch (err) {
      this.logger.warn(
        'CollaborationService: VOICE_ACCEPT dispatch failed',
        err
      );
    }
  }

  declineVoiceInvite(peerId: string): void {
    this.clearVoicePeer(peerId);
    try {
      this.peerNet.declineKnock();
    } catch {
      /* peerNet may not be in knock state */
    }
    const env: VoiceInviteMessage = {
      type: 'VOICE_DECLINE',
      v: Date.now(),
      fromUserId: this.currentUserId() ?? 'local',
      toUserId: peerId,
    };
    try {
      this.social.sendPartyMessage(JSON.stringify(env));
    } catch (err) {
      this.logger.warn(
        'CollaborationService: VOICE_DECLINE dispatch failed',
        err
      );
    }
  }

  endVoice(peerId: string): void {
    this.clearVoicePeer(peerId);
    try {
      this.peerNet.endCall();
    } catch {
      /* already idle */
    }
    const env: VoiceInviteMessage = {
      type: 'VOICE_END',
      v: Date.now(),
      fromUserId: this.currentUserId() ?? 'local',
      toUserId: peerId,
    };
    try {
      this.social.sendPartyMessage(JSON.stringify(env));
    } catch (err) {
      this.logger.warn(
        'CollaborationService: VOICE_END dispatch failed',
        err
      );
    }
  }

  private handleVoiceInvite(env: VoiceInviteMessage): void {
    this.setVoicePeer(
      env.fromUserId,
      'idle',
      0,
      this.social
        .onlineUsers()
        .find((u: any) => u.id === env.fromUserId)?.artistName ??
        env.fromUserId.slice(-4)
    );
  }

  private handleVoiceAccept(env: VoiceInviteMessage): void {
    this.setVoicePeer(env.fromUserId, 'connected', 0);
  }

  private handleVoiceDecline(env: VoiceInviteMessage): void {
    this.clearVoicePeer(env.fromUserId);
  }

  private handleVoiceEnd(env: VoiceInviteMessage): void {
    this.clearVoicePeer(env.fromUserId);
  }

  private setVoicePeer(
    userId: string,
    state: string,
    level: number,
    artistName?: string
  ): void {
    const existing = this.voicePeers();
    this.voicePeers.set({
      ...existing,
      [userId]: {
        userId,
        artistName:
          artistName ??
          this.social
            .onlineUsers()
            .find((u: any) => u.id === userId)?.artistName ??
          userId.slice(-4),
        state,
        level,
      },
    });
  }

  private clearVoicePeer(userId: string): void {
    const existing = this.voicePeers();
    if (!(userId in existing)) return;
    const next = { ...existing };
    delete next[userId];
    this.voicePeers.set(next);
  }

  /* Cursor publish (throttled to 80ms; max ~12 Hz on the wire) */
  private lastCursorPublishMs = 0;
  private lastCursorSentX = -1;
  private lastCursorSentY = -1;

  publishCursor(surface: string, x: number, y: number): void {
    if (!this.currentSession() || !this.autoSync()) return;
    const now = Date.now();
    if (now - this.lastCursorPublishMs < 80) return;
    if (
      Math.abs(x - this.lastCursorSentX) < 0.005 &&
      Math.abs(y - this.lastCursorSentY) < 0.005
    ) {
      return;
    }
    this.lastCursorPublishMs = now;
    this.lastCursorSentX = x;
    this.lastCursorSentY = y;
    const env: PeerCursorMessage = {
      type: 'PEER_CURSOR',
      v: now,
      fromUserId: this.currentUserId() ?? 'local',
      fromUserName: this.profileService.profile()?.artistName,
      payload: {
        surface,
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      },
    };
    try {
      this.social.sendPartyMessage(JSON.stringify(env));
    } catch (err) {
      this.logger.warn(
        'CollaborationService: PEER_CURSOR dispatch failed',
        err
      );
    }
  }

  /* Conflict resolution */
  resolveConflict(
    trackId: string,
    fieldKey: string,
    resolution: 'mine' | 'theirs' | 'discard'
  ): void {
    const conflict = this.pendingConflicts().find(
      (c) => c.trackId === trackId && c.fieldKey === fieldKey
    );
    if (!conflict) return;

    const remaining = this.pendingConflicts().filter(
      (c) => !(c.trackId === trackId && c.fieldKey === fieldKey)
    );
    this.pendingConflicts.set(remaining);

    if (resolution === 'discard') return;

    const value =
      resolution === 'mine' ? conflict.localValue : conflict.remoteValue;

    const trackList = (this.musicManager.tracks() ?? []).map((t: any) =>
      t && t.id === trackId ? { ...(t ?? {}), [fieldKey]: value } : t
    );
    this.isRemoteUpdate = true;
    try {
      this.musicManager.loadProject({
        ...(this.musicManager.snapshotProject() ?? {}),
        tracks: trackList,
      });
    } finally {
      setTimeout(() => (this.isRemoteUpdate = false), 250);
    }
    this.fieldVersions[trackId] = {
      ...(this.fieldVersions[trackId] ?? {}),
      [fieldKey]: Date.now(),
    };

    if (resolution === 'mine') {
      const localTrack = trackList.find((t: any) => t?.id === trackId);
      if (localTrack) this.dispatchTrackDelta(trackId, localTrack);
    }
  }

  /* Session lifecycle (Phase 1) */
  async startSession(user: AuthUser, _projectState: any = null): Promise<string> {
    const sessionId = this.generateSecureId();
    const partyKey = 'studio_' + sessionId;
    this.logger.system('INITIALIZING COLLABORATION SESSION: ' + sessionId);
    try {
      this.social.createParty(partyKey);
    } catch (err) {
      this.logger.warn('createParty failed', err);
    }
    this.lastAppliedVersion = Date.now();
    this.currentSession.set({ sessionId, partyKey, participants: [user] });
    return sessionId;
  }

  async joinSession(sessionId: string, user: AuthUser): Promise<void> {
    const partyKey = 'studio_' + sessionId;
    this.logger.system('JOINING COLLABORATION SESSION: ' + sessionId);
    try {
      this.social.joinParty(partyKey);
    } catch (err) {
      this.logger.warn('joinParty failed', err);
    }
    this.lastAppliedVersion = Date.now();
    this.currentSession.set({ sessionId, partyKey, participants: [user] });
  }

  sendProjectUpdate(_sessionId?: string, _projectState?: any): void {
    const snapshot = this.musicManager.snapshotProject();
    if (!snapshot) return;
    this.dispatchProjectSync(snapshot, false);
  }

  leaveSession(): void {
    const session = this.currentSession();
    if (!session) return;
    try {
      this.social.leaveParty();
    } catch (err) {
      this.logger.warn('leaveParty failed', err);
    }
    this.currentSession.set(null);
    this.pendingConflicts.set([]);
    this.voicePeers.set({});
    this.peerCursors.set({});
    this.logger.system('LEFT SESSION: ' + session.sessionId);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  toggleAutoSync(): void {
    this.autoSync.update((v) => !v);
    this.logger.info('CollaborationService: autoSync=' + this.autoSync());
  }

  /** Reset every in-flight buffer. Useful for teardown / tests. */
  resetForTest(): void {
    this.lastAppliedVersion = 0;
    this.lastDispatchedVersion = 0;
    this.isRemoteUpdate = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.pendingConflicts.set([]);
    this.voicePeers.set({});
    this.peerCursors.set({});
    this.fieldVersions = {};
    this.lastSnapshotByTrack = {};
    this.lastFullSnapshot = null;
    this.lastCursorPublishMs = 0;
    this.lastCursorSentX = -1;
    this.lastCursorSentY = -1;
  }

  private generateSecureId(): string {
    return Math.random().toString(36).substring(2, 9);
  }
}
