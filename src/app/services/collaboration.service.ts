import { LoggingService } from './logging.service';
import { Injectable, signal, inject, computed, effect } from '@angular/core';
import { AuthUser, AuthService } from './auth.service';
import { MusicManagerService } from './music-manager.service';
import { SocialNetworkingService } from './social-networking.service';
import { UserProfileService } from './user-profile.service';

/** Envelope stamped on every project-snapshot broadcast. */
export interface ProjectSnapshotMessage {
  type: 'PROJECT_SYNC';
  v: number;
  fromUserId: string;
  fromUserName?: string;
  payload: any;
}

/**
 * Sprint B2 Phase 1 — Real-time Collaboration Sync.
 *
 * Hardened sync over the existing peer-networking skeleton:
 *  - version stamping on dispatch (eliminates ambiguous replay ordering);
 *  - stale drop on receive (only ever apply the newest version);
 *  - debounce receive (300 ms coalescing for fader/tempo bursts);
 *  - proper loopback guard keyed off the auth user id (not the party id);
 *  - presence signal — peers in the current session party.
 *  - autoSync toggle so peers can freeze outbound broadcasts.
 */
@Injectable({ providedIn: 'root' })
export class CollaborationService {
  private logger = inject(LoggingService);
  private musicManager = inject(MusicManagerService);
  private social = inject(SocialNetworkingService);
  private auth = inject(AuthService);
  private profileService = inject(UserProfileService);

  /** Session that the local user is currently hosting or joined into. */
  currentSession = signal<{
    sessionId: string;
    partyKey: string;
    participants: AuthUser[];
  } | null>(null);

  /** User-controlled broadcast switch. */
  autoSync = signal(true);

  /** Most recently dispatched version. Used for ordering + loopback diagnosis. */
  private lastDispatchedVersion = 0;

  /** Most recently applied incoming version. Stale messages are dropped. */
  private lastAppliedVersion = 0;

  /** Suppresses outbound dispatch while a remote update is being applied. */
  private isRemoteUpdate = false;

  /** Debounce timer for inbound snapshot coalescing. */
  private debounceTimer: any = null;

  /** Authenticated user id (used to gate loopback). */
  currentUserId = computed(() => this.auth.currentUser()?.id ?? null);

  /** Short room code for sharing (4 chars). */
  sessionCode = computed(
    () => this.currentSession()?.sessionId?.slice(-4).toUpperCase() ?? '----'
  );

  /** Number of distinct online users in the party (presence count). */
  peerCount = computed(() => {
    const session = this.currentSession();
    if (!session) return 0;
    const party = this.social.currentPartyId();
    if (party !== session.partyKey) return 1; // self only
    // partyMembers may be sparse; count via onlineUsers filtered by userIds.
    const ids = new Set(this.social.partyMembers().map((m: any) => m.userId ?? m));
    if (ids.size === 0) return 1;
    return ids.size;
  });

  constructor() {
    // ── Dispatch: local changes → peers ────────────────────────────
    effect(() => {
      const session = this.currentSession();
      // Read live deps so this effect re-runs on local changes.
      const _tracks = this.musicManager.tracks();
      const _bpm = this.musicManager.engine?.tempo?.() ?? null;
      if (!session || this.isRemoteUpdate || !this.autoSync()) return;
      const snapshot = this.musicManager.snapshotProject();
      if (!snapshot) return;
      const v = Date.now();
      this.lastDispatchedVersion = v;
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
        this.logger.warn('CollaborationService: dispatch failed', err);
      }
      void _bpm;
    });

    // ── Receive: peers → local state ───────────────────────────────
    effect(() => {
      const msgs = this.social.roomMessages();
      if (msgs.length === 0) return;
      const lastMsg = msgs[msgs.length - 1];
      if (typeof lastMsg?.message !== 'string') return;
      if (!lastMsg.message.includes('"PROJECT_SYNC"')) return;
      let envelope: ProjectSnapshotMessage;
      try {
        envelope = JSON.parse(lastMsg.message) as ProjectSnapshotMessage;
      } catch {
        return;
      }
      if (!envelope || envelope.type !== 'PROJECT_SYNC') return;
      if (!envelope.fromUserId || envelope.fromUserId === this.currentUserId()) {
        return; // loopback guard
      }
      if (envelope.v <= this.lastAppliedVersion) return; // stale drop
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        if (
          this.currentSession() &&
          envelope.v > this.lastAppliedVersion
        ) {
          this.lastAppliedVersion = envelope.v;
          this.applyRemoteUpdate(envelope.payload);
        }
      }, 300);
    });
  }

  /** Apply a remote snapshot — flag suppresses outbound dispatch while active. */
  private applyRemoteUpdate(snapshot: any): void {
    this.isRemoteUpdate = true;
    try {
      this.musicManager.loadProject(snapshot);
    } finally {
      setTimeout(() => (this.isRemoteUpdate = false), 250);
    }
  }

  /** Host a new collab session (creates a party + mirrors to local session). */
  async startSession(
    user: AuthUser,
    _projectState: any = null
  ): Promise<string> {
    const sessionId = this.generateSecureId();
    const partyKey = 'studio_' + sessionId;
    this.logger.system(`INITIALIZING COLLABORATION SESSION: ${sessionId}`);
    try {
      this.social.createParty(partyKey);
    } catch (err) {
      this.logger.warn('createParty failed', err);
    }
    this.lastAppliedVersion = Date.now();
    this.currentSession.set({ sessionId, partyKey, participants: [user] });
    return sessionId;
  }

  /** Join an existing session by id. */
  async joinSession(sessionId: string, user: AuthUser): Promise<void> {
    const partyKey = 'studio_' + sessionId;
    this.logger.system(`JOINING COLLABORATION SESSION: ${sessionId}`);
    try {
      this.social.joinParty(partyKey);
    } catch (err) {
      this.logger.warn('joinParty failed', err);
    }
    this.lastAppliedVersion = Date.now();
    this.currentSession.set({ sessionId, partyKey, participants: [user] });
  }

  /** Manual dispatch — kept for callers that want an explicit re-broadcast. */
  sendProjectUpdate(_sessionId?: string, _projectState?: any): void {
    const snapshot = this.musicManager.snapshotProject();
    if (!snapshot) return;
    const v = Date.now();
    this.lastDispatchedVersion = v;
    const envelope: ProjectSnapshotMessage = {
      type: 'PROJECT_SYNC',
      v,
      fromUserId: this.currentUserId() ?? 'local',
      payload: snapshot,
    };
    this.social.sendPartyMessage(JSON.stringify(envelope));
  }

  /** Leave the current session. */
  leaveSession(): void {
    const session = this.currentSession();
    if (!session) return;
    try {
      this.social.leaveParty();
    } catch (err) {
      this.logger.warn('leaveParty failed', err);
    }
    this.currentSession.set(null);
    this.logger.system(`LEFT SESSION: ${session.sessionId}`);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  toggleAutoSync(): void {
    this.autoSync.update((v) => !v);
    this.logger.info('CollaborationService: autoSync=' + !this.autoSync());
  }

  /** Test helper: drop any in-flight debounce (e.g. on teardown). */
  resetForTest(): void {
    this.lastAppliedVersion = 0;
    this.lastDispatchedVersion = 0;
    this.isRemoteUpdate = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private generateSecureId(): string {
    return Math.random().toString(36).substring(2, 9);
  }
}
