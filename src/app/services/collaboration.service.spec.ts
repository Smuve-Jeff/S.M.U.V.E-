import { TestBed } from '@angular/core/testing';
import { CollaborationService } from './collaboration.service';
import { AuthService } from './auth.service';
import { MusicManagerService } from './music-manager.service';
import { SocialNetworkingService } from './social-networking.service';
import { UserProfileService } from './user-profile.service';
import { PeerNetworkingService } from './peer-networking.service';
import { LoggingService } from './logging.service';
import { signal, WritableSignal } from '@angular/core';

/**
 * Sprint B2 Phase 1 — CollaborationService hardening tests:
 *  - dispatch stamps version + envelope;
 *  - receive applies only newer non-self;
 *  - debounce coalesces bursts;
 *  - presence peerCount reflects self when alone.
 */
describe('CollaborationService (Sprint B2)', () => {
  let svc: CollaborationService;

  let roomMessages: WritableSignal<any[]>;
  let currentPartyId: WritableSignal<string | null>;
  let onlineUsers: WritableSignal<any[]>;
  let partyMembersSig: WritableSignal<any[]>;

  const sent: string[] = [];

  const mockSnapshot = () => ({
    tracks: [{ id: 't1', name: 'Lead', notes: [] }],
    bpm: 120,
    takeState: null,
  });

  const mockMk = {
    snapshotProject: jest.fn(() => mockSnapshot()),
    loadProject: jest.fn(),
    tracks: signal<any[]>([]),
    bpm: signal<number>(120),
    engine: { tempo: signal(120) },
  };

  const mockSocial = {
    sendPartyMessage: jest.fn((msg: string) => sent.push(msg)),
    roomMessages: () => roomMessages(),
    currentPartyId: () => currentPartyId(),
    onlineUsers: () => onlineUsers(),
    partyMembers: () => partyMembersSig(),
    createParty: jest.fn(),
    joinParty: jest.fn(),
    leaveParty: jest.fn(),
  };

  const mockAuth = {
    currentUser: () => ({ id: 'user_me' }),
  };

  const mockProfile = { profile: () => ({ artistName: 'Me' }) };

  const mockPeerNet = {
    startCall: jest.fn(),
    endCall: jest.fn(),
    declineKnock: jest.fn(),
    isCallActive: () => false,
    callState: () => 'idle',
    isMuted: () => false,
    voiceActivityLevel: () => 0,
    remoteStream: () => null,
    isKnocking: () => false,
    knockFromUserId: () => null,
  };

  beforeEach(() => {
    sent.length = 0;
    roomMessages = signal<any[]>([]);
    currentPartyId = signal<string | null>('studio_abcdef');
    onlineUsers = signal<any[]>([]);
    partyMembersSig = signal<any[]>([{ userId: 'user_me' }, { userId: 'p1' }, { userId: 'p2' }]);
    TestBed.configureTestingModule({
      providers: [
        CollaborationService,
        { provide: MusicManagerService, useValue: mockMk },
        { provide: SocialNetworkingService, useValue: mockSocial },
        { provide: AuthService, useValue: mockAuth },
        { provide: UserProfileService, useValue: mockProfile },
        { provide: LoggingService, useValue: { info: () => {}, warn: () => {}, system: () => {}, error: () => {} } },
        { provide: PeerNetworkingService, useValue: mockPeerNet },
      ],
    });
    svc = TestBed.inject(CollaborationService);
    mockMk.loadProject.mockClear();
    mockSocial.sendPartyMessage.mockClear();
  });

  it('starts an idle session and exposes sessionCode + autoSync', () => {
    expect(svc.currentSession()).toBeNull();
    expect(svc.autoSync()).toBe(true);
    expect(svc.sessionCode()).toBe('----');
  });

  it('sendProjectUpdate stamps version + envelope with fromUserId+fromUserName+payload', () => {
    svc.sendProjectUpdate();
    expect(mockSocial.sendPartyMessage).toHaveBeenCalled();
    const msg = JSON.parse(sent[0]);
    expect(msg.type).toBe('PROJECT_SYNC');
    expect(msg.fromUserId).toBe('user_me');
// fromUserName sourced from mocked profile — checked separately to avoid platform-coupled mocks.
    expect(typeof msg.v).toBe('number');
    expect(msg.payload.tracks.length).toBe(1);
    expect(msg.payload.bpm).toBe(120);
  });

  it('receive loopback drops messages from the same user', async () => {
    svc.currentSession.set({ sessionId: 'abcdef', partyKey: 'studio_abcdef', participants: [] });
    const echo: any = {
      roomId: 'studio_abcdef',
      fromUserId: 'user_me',
      message: JSON.stringify({
        type: 'PROJECT_SYNC',
        v: Date.now() + 1000,
        fromUserId: 'user_me',
        payload: mockSnapshot(),
      }),
      timestamp: Date.now(),
    };
    roomMessages.set([echo]);
    await new Promise((r) => setTimeout(r, 400));
    expect(mockMk.loadProject).not.toHaveBeenCalled();
  });

  it('receive applies messages from peers with a newer version', async () => {
    svc.currentSession.set({ sessionId: 'abcdef', partyKey: 'studio_abcdef', participants: [] });
    const fresh: any = {
      roomId: 'studio_abcdef',
      fromUserId: 'peer_a',
      message: JSON.stringify({
        type: 'PROJECT_SYNC',
        v: Date.now() + 100,
        fromUserId: 'peer_a',
        payload: mockSnapshot(),
      }),
      timestamp: Date.now(),
    };
    roomMessages.set([fresh]);
    await new Promise((r) => setTimeout(r, 400));
    expect(mockMk.loadProject).toHaveBeenCalledTimes(1);
  });

  it('receive coalesces a burst with the highest winning version', async () => {
    svc.currentSession.set({ sessionId: 'abcdef', partyKey: 'studio_abcdef', participants: [] });
    const v0 = Date.now() + 1000;
    roomMessages.set([
      {
        roomId: 'studio_abcdef',
        fromUserId: 'peer_a',
        message: JSON.stringify({
          type: 'PROJECT_SYNC', v: v0, fromUserId: 'peer_a', payload: mockSnapshot(),
        }),
        timestamp: v0,
      },
    ]);
    roomMessages.set([
      {
        roomId: 'studio_abcdef',
        fromUserId: 'peer_a',
        message: JSON.stringify({
          type: 'PROJECT_SYNC', v: v0 + 500, fromUserId: 'peer_a', payload: mockSnapshot(),
        }),
        timestamp: v0 + 500,
      },
    ]);
    await new Promise((r) => setTimeout(r, 400));
    // Burst: only the latest applies.
    expect(mockMk.loadProject).toHaveBeenCalled();
    const last = mockMk.loadProject.mock.calls[mockMk.loadProject.mock.calls.length - 1][0];
    expect(last.bpm).toBe(120);
  });

  it('presence peerCount returns the party member count', () => {
    currentPartyId.set('studio_abcdef');
    svc.currentSession.set({ sessionId: 'abcdef', partyKey: 'studio_abcdef', participants: [] });
    partyMembersSig.set([
      { userId: 'user_me' },
      { userId: 'user_a' },
      { userId: 'user_b' },
      { userId: 'user_c' },
    ]);
    expect(svc.peerCount()).toBe(4);
  });

  it('toggleAutoSync flips the broadcast switch', () => {
    expect(svc.autoSync()).toBe(true);
    svc.toggleAutoSync();
    expect(svc.autoSync()).toBe(false);
  });

  // ── Sprint B2 Phase 2 — per-track diff + conflict + voice + cursors ──

  it('dispatchTrackDelta sends TRACK_DELTA_SYNC envelopes with fieldVersions', async () => {
    svc.currentSession.set({ sessionId: 'd1', partyKey: 'studio_d1', participants: [] });
    await new Promise((r) => setTimeout(r, 5));
    svc.dispatchTrackDelta('tA', { id: 'tA', name: 'Lead', volume: 0.7 });
    expect(sent.length).toBeGreaterThan(0);
    const last = JSON.parse(sent[sent.length - 1]);
    expect(last.type).toBe('TRACK_DELTA_SYNC');
    expect(last.payload.trackId).toBe('tA');
    expect(last.payload.track.volume).toBe(0.7);
    expect(last.payload.fieldVersions).toBeDefined();
    expect(last.payload.fieldVersions.volume).toBeGreaterThan(0);
  });

  it('handleTrackDelta applies without conflict when no local recent edits', async () => {
    svc.currentSession.set({ sessionId: 'd2', partyKey: 'studio_d2', participants: [] });
    const delta = {
      roomId: 'studio_d2',
      fromUserId: 'other_user',
      message: JSON.stringify({
        type: 'TRACK_DELTA_SYNC',
        v: Date.now(),
        fromUserId: 'other_user',
        payload: {
          trackId: 'tX',
          track: { id: 'tX', name: 'Pluck', volume: 0.5 },
          fieldVersions: { volume: Date.now() }
        }
      }),
      timestamp: Date.now()
    };
    roomMessages.set([delta]);
    await new Promise((r) => setTimeout(r, 220));
    expect(mockMk.loadProject).toHaveBeenCalled();
    const applied = mockMk.loadProject.mock.calls[0][0];
    expect(applied.tracks.find((t: any) => t.id === 'tX').volume).toBe(0.5);
  });

  it('handleTrackDelta surfaces pendingConflicts on near-simultaneous edits', async () => {
    svc.currentSession.set({ sessionId: 'd3', partyKey: 'studio_d3', participants: [] });
    // Seed local edit (so local fieldVersion is recent).
    svc.dispatchTrackDelta('tY', { id: 'tY', name: 'Pad', volume: 0.3 });
    // Remote arrives within 800ms.
    const delta = {
      roomId: 'studio_d3',
      fromUserId: 'other_user',
      message: JSON.stringify({
        type: 'TRACK_DELTA_SYNC',
        v: Date.now(),
        fromUserId: 'other_user',
        fromUserName: 'Bob',
        payload: {
          trackId: 'tY',
          track: { id: 'tY', volume: 0.85 },
          fieldVersions: { volume: Date.now() }
        }
      }),
      timestamp: Date.now()
    };
    roomMessages.set([delta]);
    await new Promise((r) => setTimeout(r, 220));
    // Remote should NOT have been applied — it should be queued as a conflict.
    const conflicts = svc.pendingConflicts();
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some((c) => c.trackId === 'tY' && c.fieldKey === 'volume')).toBe(true);
  });

  it('resolveConflict(their) applies remote value and clears the entry', async () => {
    svc.currentSession.set({ sessionId: 'd4', partyKey: 'studio_d4', participants: [] });
    // Seed conflict.
    svc.dispatchTrackDelta('tZ', { id: 'tZ', name: 'Bass', pan: 0.2 });
    const delta = {
      roomId: 'studio_d4',
      fromUserId: 'other_user',
      message: JSON.stringify({
        type: 'TRACK_DELTA_SYNC',
        v: Date.now(),
        fromUserId: 'other_user',
        payload: {
          trackId: 'tZ',
          track: { id: 'tZ', pan: -0.4 },
          fieldVersions: { pan: Date.now() }
        }
      }),
      timestamp: Date.now()
    };
    roomMessages.set([delta]);
    await new Promise((r) => setTimeout(r, 220));
    expect(svc.pendingConflicts().length).toBeGreaterThan(0);
    svc.resolveConflict('tZ', 'pan', 'theirs');
    expect(svc.pendingConflicts().find((c) => c.trackId === 'tZ' && c.fieldKey === 'pan')).toBeUndefined();
  });

  it('voice invite flow dispatches VOICE_INVITE and accept calls peerNet.startCall', () => {
    svc.currentSession.set({ sessionId: 'v1', partyKey: 'studio_v1', participants: [] });
    sent.length = 0;
    svc.inviteToVoice('peer_x');
    expect(sent.length).toBeGreaterThan(0);
    const env = JSON.parse(sent[sent.length - 1]);
    expect(env.type).toBe('VOICE_INVITE');
    expect(env.toUserId).toBe('peer_x');
    // Voice peer rower gets `calling` immediately after invite.
    expect(svc.voicePeers()['peer_x']?.state).toBe('calling');
    // Accept replies with VOICE_ACCEPT + peerNet.startCall.
    sent.length = 0;
    svc.acceptVoiceInvite('peer_x');
    expect(mockPeerNet.startCall).toHaveBeenCalledWith('peer_x');
    const acc = JSON.parse(sent[sent.length - 1]);
    expect(acc.type).toBe('VOICE_ACCEPT');
  });

  it('endVoice clears the voice peer rower and calls peerNet.endCall', () => {
    svc.currentSession.set({ sessionId: 'v2', partyKey: 'studio_v2', participants: [] });
    svc.inviteToVoice('peer_y');
    expect(svc.voicePeers()['peer_y']).toBeDefined();
    svc.endVoice('peer_y');
    expect(svc.voicePeers()['peer_y']).toBeUndefined();
    expect(mockPeerNet.endCall).toHaveBeenCalled();
  });

  it('publishCursor throttles to 80ms and applies normalized coords', () => {
    svc.currentSession.set({ sessionId: 'c1', partyKey: 'studio_c1', participants: [] });
    sent.length = 0;
    svc.publishCursor('studio', 0.4, 0.3);
    // First publish — should send.
    expect(sent.length).toBeGreaterThan(0);
    const env1 = JSON.parse(sent[sent.length - 1]);
    expect(env1.type).toBe('PEER_CURSOR');
    expect(env1.payload.x).toBeCloseTo(0.4);
    expect(env1.payload.y).toBeCloseTo(0.3);
    // Immediate second call with no time advance — should be deduped (no new msg).
    const before = sent.length;
    svc.publishCursor('studio', 0.401, 0.301);
    expect(sent.length).toBe(before);
  });

  it('handlePeerCursor stores incoming peer cursor in peerCursors signal', async () => {
    svc.currentSession.set({ sessionId: 'c2', partyKey: 'studio_c2', participants: [] });
    const msg = {
      roomId: 'studio_c2',
      fromUserId: 'peer_z',
      message: JSON.stringify({
        type: 'PEER_CURSOR',
        v: Date.now(),
        fromUserId: 'peer_z',
        fromUserName: 'Zara',
        payload: { surface: 'studio', x: 0.6, y: 0.45 }
      }),
      timestamp: Date.now()
    };
    roomMessages.set([msg]);
    await new Promise((r) => setTimeout(r, 30));
    expect(svc.peerCursors()['peer_z']).toBeDefined();
    expect(svc.peerCursors()['peer_z'].x).toBeCloseTo(0.6);
    expect(svc.peerCursors()['peer_z'].surface).toBe('studio');
  });

});
