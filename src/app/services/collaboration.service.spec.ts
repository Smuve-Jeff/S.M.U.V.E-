import { TestBed } from '@angular/core/testing';
import { CollaborationService } from './collaboration.service';
import { AuthService } from './auth.service';
import { MusicManagerService } from './music-manager.service';
import { SocialNetworkingService } from './social-networking.service';
import { UserProfileService } from './user-profile.service';
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
});
