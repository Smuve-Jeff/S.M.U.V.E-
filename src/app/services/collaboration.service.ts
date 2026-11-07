import { LoggingService } from './logging.service';
import { canonicalize } from '../utils/djb2-hash.util';
import {
  Injectable,
  signal,
  inject,
  computed,
  effect,
  untracked,
  WritableSignal,
} from '@angular/core';
import { AuthUser, AuthService } from './auth.service';
import { MusicManagerService } from './music-manager.service';
import { SocialNetworkingService } from './social-networking.service';
import { UserProfileService } from './user-profile.service';
import { PeerNetworkingService } from './peer-networking.service';
import { ProjectService } from './project.service';
import {
  StudioCollaborationPermission,
  StudioCollaborationPermissions,
  StudioCollaborationRole,
  StudioSessionMember,
  StudioSessionSyncState,
} from '../types/studio-orchestration.types';

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

interface StudioSessionState {
  sessionId: string;
  partyKey: string;
  projectId: string | null;
  participants: AuthUser[];
}

const ROLE_PERMISSIONS: Record<
  StudioCollaborationRole,
  StudioCollaborationPermissions
> = {
  host: {
    edit: true,
    transport: true,
    invite: true,
    voice: true,
    approve: true,
    share: true,
    remix: true,
    comment: true,
    review: true,
    export: true,
  },
  editor: {
    edit: true,
    transport: true,
    invite: false,
    voice: true,
    approve: false,
    share: true,
    remix: true,
    comment: true,
    review: true,
    export: true,
  },
  reviewer: {
    edit: false,
    transport: false,
    invite: false,
    voice: false,
    approve: true,
    share: true,
    remix: false,
    comment: true,
    review: true,
    export: false,
  },
  viewer: {
    edit: false,
    transport: false,
    invite: false,
    voice: false,
    approve: false,
    share: true,
    remix: false,
    comment: false,
    review: false,
    export: false,
  },
};

function resolvePermissions(
  role: StudioCollaborationRole,
  overrides?: Partial<StudioCollaborationPermissions> | null
): StudioCollaborationPermissions {
  return {
    ...ROLE_PERMISSIONS[role],
    ...(overrides ?? {}),
  };
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
  private projects = inject(ProjectService);

  /* Session state */
  currentSession = signal<StudioSessionState | null>(null);
  sessionMembers: WritableSignal<StudioSessionMember[]> = signal([]);

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
  /** Structural/tempo baseline for deciding delta vs full snapshot. */
  private lastSyncedTrackIds: string[] = [];
  private lastSyncedBpm: number | null = null;
  private lastSyncedSignature = '';
  private hasInitialSync = false;

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
        p.state === 'calling' || p.state === 'connected' || p.state === 'muted'
    );
  });

  /* Phase 2: peer cursors */
  peerCursors: WritableSignal<Record<string, PeerCursorState>> = signal({});

  /* Public computed signals (Phase 1) */
  currentUserId = computed(() => this.auth.currentUser()?.id ?? null);
  currentRole = computed<StudioCollaborationRole>(() => {
    const currentUserId = this.currentUserId();
    if (!currentUserId || !this.currentSession()) return 'host';
    return (
      this.sessionMembers().find((member) => member.userId === currentUserId)
        ?.role ?? 'viewer'
    );
  });
  currentPermissions = computed(() =>
    resolvePermissions(
      this.currentRole(),
      this.sessionMembers().find(
        (member) => member.userId === this.currentUserId()
      )?.permissions
    )
  );

  sessionCode = computed(
    () => this.currentSession()?.sessionId?.slice(-4).toUpperCase() ?? '----'
  );

  peerCount = computed(() => {
    const session = this.currentSession();
    if (!session) return 0;
    const members = this.sessionMembers().filter(
      (member) => member.status !== 'revoked'
    );
    return members.length > 0 ? members.length : 1;
  });

  /** Compact peer roster for the presence header. */
  peerRoster = computed(() => {
    const session = this.currentSession();
    if (!session) return [] as { userId: string; artistName: string }[];
    return this.sessionMembers()
      .filter(
        (member) =>
          member.status !== 'revoked' && member.userId !== this.currentUserId()
      )
      .map((member) => ({
        userId: member.userId,
        artistName:
          member.artistName ??
          this.social.onlineUsers().find((u: any) => u.userId === member.userId)
            ?.artistName ??
          member.userId.slice(-4),
      }));
  });

  constructor() {
    effect(() => {
      const session = this.currentSession();
      // Read every reactive source before any early return. In particular,
      // returning before `tracks()` while a remote delta is being applied
      // would remove the track signal from this effect's dependencies and
      // stop all later local edits from syncing.
      const tracks = this.musicManager.tracks();
      if (!session || this.isRemoteUpdate || !this.autoSync()) return;
      // Quick Session projects may not have a ProjectService record yet. The
      // collaboration layer still needs a snapshot to seed a peer and to
      // detect later track edits, so build the minimal one it needs.
      const snapshot =
        this.musicManager.snapshotProject() ?? {
          id: session.projectId ?? 'studio-session',
          name: 'Studio Session',
          tracks: tracks as any,
          bpm: this.musicManager.engine?.tempo?.() ?? 120,
          timeSignature: null,
          takeState: null,
        };
      const ids = tracks.map((track: any) => track?.id).filter(Boolean);
      const bpm = snapshot.bpm ?? 120;
      const signature = JSON.stringify(snapshot.timeSignature ?? null);
      const structuralChange =
        ids.length !== this.lastSyncedTrackIds.length ||
        ids.some((id: string, index: number) => id !== this.lastSyncedTrackIds[index]);

      if (
        !this.hasInitialSync ||
        structuralChange ||
        bpm !== this.lastSyncedBpm ||
        signature !== this.lastSyncedSignature
      ) {
        this.dispatchProjectSync(snapshot, false);
        return;
      }

      for (const track of tracks) {
        const previous = this.lastSnapshotByTrack[track.id];
        if (!previous || canonicalize(previous) !== canonicalize(track)) {
          this.dispatchTrackDelta(track.id, track);
        }
      }
    });

    this.heartbeatTimer = setInterval(() => {
      if (!this.currentSession() || !this.autoSync() || this.isRemoteUpdate)
        return;
      const snap = this.musicManager.snapshotProject();
      if (!snap) return;
      this.dispatchProjectSync(snap, true);
    }, 30_000);

    effect(() => {
      const sync = this.social.sessionSyncState();
      if (!sync?.session) return;
      // Do not track currentSession here: applying the sync writes it, which
      // would re-run this effect and apply the same sync forever.
      const activeSessionId = untracked(
        () => this.currentSession()?.sessionId
      );
      if (sync.session.id !== activeSessionId) return;
      untracked(() => this.applySessionSync(sync));
    });

    effect(() => {
      const events = this.social.studioSessionEvents();
      if (events.length === 0) return;
      const latest = events[events.length - 1];
      if (latest?.sessionId !== this.currentSession()?.sessionId) return;
      untracked(() =>
        this.handleIncomingEnvelope(latest.event as CollabMessage)
      );
    });

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
      untracked(() => this.handleIncomingEnvelope(env));
    });
  }

  /* Dispatch helpers */

  can(permission: StudioCollaborationPermission): boolean {
    const session = this.currentSession();
    if (!session) return true;
    return !!this.currentPermissions()[permission];
  }

  private applySessionSync(sync: StudioSessionSyncState): void {
    const current = this.currentSession();
    const projectId = sync.session?.projectId ?? current?.projectId ?? null;
    this.sessionMembers.set(sync.members ?? []);
    // Only replace the session when the server actually changed something.
    // A repeated sync must not create a new session object on every event.
    if (current && current.projectId !== projectId) {
      this.currentSession.set({ ...current, projectId });
    }
  }

  private emitSessionEnvelope(envelope: CollabMessage): void {
    const session = this.currentSession();
    if (!session) return;
    try {
      this.social.sendStudioSessionEvent(session.sessionId, envelope);
    } catch (err) {
      this.logger.warn(
        'CollaborationService: session event dispatch failed',
        err
      );
      try {
        this.social.sendPartyMessage(JSON.stringify(envelope));
      } catch (fallbackErr) {
        this.logger.warn(
          'CollaborationService: fallback party dispatch failed',
          fallbackErr
        );
      }
    }
  }

  private dispatchProjectSync(snapshot: any, _isHeartbeat: boolean): void {
    if (!this.can('edit')) return;
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
    this.emitSessionEnvelope(envelope);
    this.rememberSnapshot(snapshot);
  }

  /**
   * Dispatch a per-track delta. Falls back to a full PROJECT_SYNC when the
   * delta would exceed the size budget or the diff shrunk nothing.
   */
  dispatchTrackDelta(trackId: string, trackState: any, force = false): void {
    if (
      !this.currentSession() ||
      this.isRemoteUpdate ||
      !this.autoSync() ||
      !this.can('edit')
    )
      return;
    const v = Date.now();
    this.lastDispatchedVersion = v;
    const previous = this.lastSnapshotByTrack[trackId];
    const fieldVersions: Record<string, number> = {};
    for (const key of Object.keys(trackState ?? {})) {
      if (
        !previous ||
        canonicalize(previous[key]) !== canonicalize(trackState[key])
      ) {
        fieldVersions[key] = v;
      }
    }
    // No actual field changed (a rename-free signal flush); do not send an
    // empty delta that would still look like an edit to a peer. Resolution
    // can force a resend so "keep mine" still reaches the peers.
    if (previous && Object.keys(fieldVersions).length === 0) {
      if (!force) return;
      for (const key of Object.keys(trackState ?? {})) fieldVersions[key] = v;
    }

    this.fieldVersions[trackId] = {
      ...(this.fieldVersions[trackId] ?? {}),
      ...fieldVersions,
    };
    this.lastSnapshotByTrack[trackId] = this.clone(trackState);
    if (!this.lastSyncedTrackIds.includes(trackId)) {
      this.lastSyncedTrackIds.push(trackId);
    }

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
    this.emitSessionEnvelope(envelope);
  }

  /* Receive handlers */

  private handleIncomingEnvelope(env: CollabMessage): void {
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
  }

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
    const localTrack = (this.musicManager.tracks() ?? []).find(
      (entry: any) => entry?.id === trackId,
    );

    const now = Date.now();
    const newConflicts: ProjectConflict[] = [];
    for (const field of Object.keys(remoteVersions)) {
      const lv = localVersions[field] ?? 0;
      const rv = remoteVersions[field];
      const localValue =
        localTrack?.[field] ?? this.lastSnapshotByTrack[trackId]?.[field] ?? null;
      const remoteValue = track[field];
      // A delta carries field versions for the whole track, so a recent
      // version alone is not a conflict: the two values must actually differ.
      // Without this, every unchanged field (name, id, clips...) became a
      // "conflict" on any near-simultaneous edit.
      const changed = canonicalize(localValue) !== canonicalize(remoteValue);
      if (
        lv &&
        rv &&
        lv < rv &&
        now - lv < 800 &&
        remoteValue !== undefined &&
        changed
      ) {
        newConflicts.push({
          trackId,
          fieldKey: field,
          remoteValue,
          remoteUserId: env.fromUserId,
          remoteUserName: env.fromUserName,
          remoteAtMs: rv,
          localValue,
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
        // A delta only owns the fields named in fieldVersions. Replacing the
        // whole track would silently discard unrelated local edits made since
        // the sender's snapshot.
        const merged: any = {
          ...(localTrack ?? { id: trackId }),
        };
        for (const field of Object.keys(remoteVersions)) {
          merged[field] = track[field];
        }
        const trackList = this.upsertTrackState(trackId, merged);
        this.musicManager.loadProject({
          ...(this.musicManager.snapshotProject() ?? {}),
          tracks: trackList,
        });
        this.lastSnapshotByTrack[trackId] = this.clone(merged);
        if (!this.lastSyncedTrackIds.includes(trackId)) {
          this.lastSyncedTrackIds.push(trackId);
        }
      } finally {
        setTimeout(() => (this.isRemoteUpdate = false), 250);
      }
    }, 120);
  }

  private applyRemoteUpdate(snapshot: any): void {
    this.isRemoteUpdate = true;
    try {
      this.musicManager.loadProject(snapshot);
      this.rememberSnapshot(snapshot);
    } finally {
      setTimeout(() => (this.isRemoteUpdate = false), 250);
    }
  }

  /** Store the state both sides now agree on, so the effect cannot echo it. */
  private rememberSnapshot(snapshot: any): void {
    const tracks = Array.isArray(snapshot?.tracks)
      ? snapshot.tracks
      : this.musicManager.tracks();
    this.lastSnapshotByTrack = {};
    for (const track of tracks) {
      if (track?.id) this.lastSnapshotByTrack[track.id] = this.clone(track);
    }
    this.lastSyncedTrackIds = tracks
      .map((track: any) => track?.id)
      .filter(Boolean);
    this.lastSyncedBpm =
      typeof snapshot?.bpm === 'number'
        ? snapshot.bpm
        : (this.musicManager.engine?.tempo?.() ?? 120);
    this.lastSyncedSignature = JSON.stringify(snapshot?.timeSignature ?? null);
    this.hasInitialSync = true;
  }

  private clone<T>(value: T): T {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  }

  private resetSyncBaseline(): void {
    this.hasInitialSync = false;
    this.lastSnapshotByTrack = {};
    this.lastSyncedTrackIds = [];
    this.lastSyncedBpm = null;
    this.lastSyncedSignature = '';
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
            .find((u: any) => u.userId === env.fromUserId)?.artistName ??
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
    if (!this.currentSession() || !peerId || !this.can('voice')) return;
    this.setVoicePeer(peerId, 'calling', 0);
    const env: VoiceInviteMessage = {
      type: 'VOICE_INVITE',
      v: Date.now(),
      fromUserId: this.currentUserId() ?? 'local',
      toUserId: peerId,
    };
    this.emitSessionEnvelope(env);
  }

  acceptVoiceInvite(peerId: string): void {
    if (!this.can('voice')) return;
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
    this.emitSessionEnvelope(env);
  }

  declineVoiceInvite(peerId: string): void {
    if (!this.can('voice')) return;
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
    this.emitSessionEnvelope(env);
  }

  endVoice(peerId: string): void {
    if (!this.can('voice')) return;
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
    this.emitSessionEnvelope(env);
  }

  private handleVoiceInvite(env: VoiceInviteMessage): void {
    this.setVoicePeer(
      env.fromUserId,
      'idle',
      0,
      this.social.onlineUsers().find((u: any) => u.userId === env.fromUserId)
        ?.artistName ?? env.fromUserId.slice(-4)
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
          this.social.onlineUsers().find((u: any) => u.userId === userId)
            ?.artistName ??
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
    this.emitSessionEnvelope(env);
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

    const existingTrack = (this.musicManager.tracks() ?? []).find(
      (t: any) => t?.id === trackId
    );
    const trackList = this.upsertTrackState(trackId, {
      ...(existingTrack ?? { id: trackId }),
      [fieldKey]: value,
    });
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
      if (localTrack) this.dispatchTrackDelta(trackId, localTrack, true);
      return;
    }

    // "Use theirs" is a remote-authored state. Record it as the new baseline so
    // the local sync effect does not immediately echo it back as an edit.
    const applied = trackList.find((t: any) => t?.id === trackId);
    if (applied) {
      this.lastSnapshotByTrack[trackId] = this.clone(applied);
      if (!this.lastSyncedTrackIds.includes(trackId)) {
        this.lastSyncedTrackIds.push(trackId);
      }
    }
  }

  private upsertTrackState(trackId: string, nextTrack: any): any[] {
    const currentTracks = this.musicManager.tracks() ?? [];
    const nextTracks = currentTracks.map((track: any) =>
      track && track.id === trackId ? { ...nextTrack } : track
    );
    if (nextTracks.some((track: any) => track?.id === trackId)) {
      return nextTracks;
    }
    return [...nextTracks, { ...nextTrack }];
  }

  /* Session lifecycle (Phase 1) */
  async startSession(
    user: AuthUser,
    _projectState: any = null
  ): Promise<string> {
    const sessionId = this.generateSecureId();
    const partyKey = 'studio_' + sessionId;
    const projectId =
      _projectState?.id ?? this.projects.currentProject()?.id ?? null;
    this.logger.system('INITIALIZING COLLABORATION SESSION: ' + sessionId);
    try {
      this.social.createParty(partyKey);
    } catch (err) {
      this.logger.warn('createParty failed', err);
    }
    this.social.createStudioSession({
      sessionId,
      projectId,
      sessionName:
        _projectState?.name ??
        this.projects.currentProject()?.name ??
        'Studio Session',
      role: 'host',
    });
    this.lastAppliedVersion = Date.now();
    this.resetSyncBaseline();
    this.currentSession.set({
      sessionId,
      partyKey,
      projectId,
      participants: [user],
    });
    this.sessionMembers.set([
      {
        sessionId,
        userId: user.id,
        artistName: user.artistName,
        role: 'host',
        status: 'active',
        joinedAt: Date.now(),
      },
    ]);
    this.social.requestSessionSync(sessionId);
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
    this.social.joinStudioSession(sessionId);
    this.lastAppliedVersion = Date.now();
    this.resetSyncBaseline();
    this.currentSession.set({
      sessionId,
      partyKey,
      projectId: this.projects.currentProject()?.id ?? null,
      participants: [user],
    });
    this.social.requestSessionSync(sessionId);
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
    this.social.leaveStudioSession(session.sessionId);
    this.currentSession.set(null);
    this.resetSyncBaseline();
    this.sessionMembers.set([]);
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
    this.sessionMembers.set([]);
    this.fieldVersions = {};
    this.lastSnapshotByTrack = {};
    this.lastFullSnapshot = null;
    this.resetSyncBaseline();
    this.lastCursorPublishMs = 0;
    this.lastCursorSentX = -1;
    this.lastCursorSentY = -1;
  }

  private generateSecureId(): string {
    return Math.random().toString(36).substring(2, 9);
  }
}
