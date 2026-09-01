import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { SocialNetworkingService } from './social-networking.service';
import { UserProfileService } from './user-profile.service';
import { PeerNetworkingService } from './peer-networking.service';
import { ChallengeInboxService } from './challenge-inbox.service';
import { TokenService } from './token.service';

const socketHandlers = new Map<string, (data: any) => void>();
const mockSocket = {
  on: jest.fn((event: string, handler: (data: any) => void) => {
    socketHandlers.set(event, handler);
  }),
  emit: jest.fn(),
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

describe('SocialNetworkingService', () => {
  let service: SocialNetworkingService;

  beforeEach(() => {
    socketHandlers.clear();
    mockSocket.on.mockClear();
    mockSocket.emit.mockClear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SocialNetworkingService,
        {
          provide: UserProfileService,
          useValue: {
            profile: signal({
              id: 'test-id',
              artistName: 'Test Artist',
              primaryGenre: 'Test Genre',
              profileSetupCompleted: true,
            }),
          },
        },
        {
          provide: PeerNetworkingService,
          useValue: {
            handleSignal: jest.fn(),
          },
        },
        {
          provide: ChallengeInboxService,
          useValue: {
            bindSocket: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            jwtToken: signal('jwt-token'),
          },
        },
      ],
    });
    service = TestBed.inject(SocialNetworkingService);
    TestBed.flushEffects();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
  });

  it('should be created and initialize the socket for an authenticated profile', () => {
    expect(service).toBeTruthy();
    expect(mockSocket.on).toHaveBeenCalled();
  });

  it('emits studio session events through the socket', () => {
    service.sendStudioSessionEvent('sess-1', { type: 'PROJECT_SYNC', v: 1 });

    expect(mockSocket.emit).toHaveBeenCalledWith('studio_session_event', {
      sessionId: 'sess-1',
      event: { type: 'PROJECT_SYNC', v: 1 },
    });
  });

  it('stores incoming session sync payloads', () => {
    const syncPayload = {
      session: { id: 'sess-1', projectId: 'proj-1', status: 'active' },
      members: [],
      comments: [],
      approvals: [],
      asyncPackets: [],
      remixLineage: [],
    };

    socketHandlers.get('session_sync')?.(syncPayload);

    expect(service.sessionSyncState()).toEqual(syncPayload);
  });

  it('surfaces squad invites as a non-blocking banner instead of a native confirm', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => false);
    try {
      socketHandlers.get('party_invite')?.({
        partyId: 'party-1',
        fromUserId: 'rival-1',
        fromUserName: 'RIVAL',
        gameId: 'mk2',
      });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(service.pendingPartyInvite()).toEqual({
        partyId: 'party-1',
        fromUserId: 'rival-1',
        fromUserName: 'RIVAL',
        gameId: 'mk2',
      });
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('accepts a squad invite by joining the party and opening the party tab', () => {
    socketHandlers.get('party_invite')?.({
      partyId: 'party-1',
      fromUserId: 'rival-1',
      fromUserName: 'RIVAL',
    });

    service.acceptPartyInvite('party-1');

    expect(mockSocket.emit).toHaveBeenCalledWith('join_party', {
      partyId: 'party-1',
    });
    expect(service.currentPartyId()).toBe('party-1');
    expect(service.activeHubTab()).toBe('party');
    expect(service.pendingPartyInvite()).toBeNull();
  });

  it('declines a squad invite without joining', () => {
    socketHandlers.get('party_invite')?.({
      partyId: 'party-1',
      fromUserId: 'rival-1',
      fromUserName: 'RIVAL',
    });

    service.declinePartyInvite();

    expect(mockSocket.emit).not.toHaveBeenCalledWith('join_party', expect.anything());
    expect(service.pendingPartyInvite()).toBeNull();
    expect(service.currentPartyId()).toBeNull();
  });

  it('surfaces neural sync requests as a non-blocking banner', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => false);
    try {
      socketHandlers.get('neural_sync_invite')?.({
        fromUserId: 'rival-1',
        fromUserName: 'RIVAL',
      });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(service.pendingNeuralSync()).toEqual({
        fromUserId: 'rival-1',
        fromUserName: 'RIVAL',
      });
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('approves a neural sync request through the socket', () => {
    socketHandlers.get('neural_sync_invite')?.({
      fromUserId: 'rival-1',
      fromUserName: 'RIVAL',
    });

    service.acceptNeuralSyncRequest('rival-1');

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'neural_sync_approve',
      expect.objectContaining({ toUserId: 'rival-1' })
    );
    expect(service.pendingNeuralSync()).toBeNull();
  });

  it('replaces the room buffer with server history on room_history', () => {
    service.joinRoom('lobby-1');
    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', 'lobby-1');

    socketHandlers.get('room_history')?.({
      roomId: 'lobby-1',
      messages: [
        { id: 1, roomId: 'lobby-1', fromUserId: 'u2', fromUserName: 'Rival', message: 'gg', timestamp: 1 },
        { id: 2, roomId: 'lobby-1', fromUserId: 'u1', fromUserName: 'Test Artist', message: 'wp', timestamp: 2 },
      ],
    });

    expect(service.roomMessages()).toHaveLength(2);
    expect(service.roomMessages()[0].message).toBe('gg');
  });

  it('ignores room_history for a room the client is not viewing', () => {
    service.joinRoom('lobby-1');
    service.roomMessages.set([{ roomId: 'stale', fromUserId: 'x', message: 'keep', timestamp: 0 }]);

    socketHandlers.get('room_history')?.({
      roomId: 'lobby-OTHER',
      messages: [{ roomId: 'lobby-OTHER', fromUserId: 'x', message: 'nope', timestamp: 0 }],
    });

    expect(service.roomMessages().every((m) => m.roomId !== 'lobby-OTHER')).toBe(true);
  });

  it('loads persisted room history via REST', async () => {
    const httpMock = TestBed.inject(HttpTestingController);
    service.joinRoom('lobby-1');

    const promise = service.loadRoomHistory('lobby-1');
    const req = httpMock.expectOne((r) =>
      r.method === 'GET' && r.url.includes('/rooms/lobby-1/messages')
    );
    req.flush([
      { id: 1, roomId: 'lobby-1', fromUserId: 'u2', message: 'hello', timestamp: 10 },
    ]);
    const history = await promise;

    expect(history).toHaveLength(1);
    expect(service.roomMessages()[0].message).toBe('hello');
  });

  it('loads the server-authoritative blocklist', async () => {
    const httpMock = TestBed.inject(HttpTestingController);

    const promise = service.loadBlockedUsers();
    const req = httpMock.expectOne((r) =>
      r.method === 'GET' && r.url.includes('/users/test-id/blocks')
    );
    req.flush([{ userId: 'rival-1', artistName: 'RIVAL' }]);
    await promise;

    expect(service.blockedUsers()).toEqual([{ userId: 'rival-1', artistName: 'RIVAL' }]);
  });

  it('blocks a user via REST and scrubs them from discovery surfaces', async () => {
    const httpMock = TestBed.inject(HttpTestingController);
    service.onlineUsers.set([
      { userId: 'rival-1', artistName: 'RIVAL' },
      { userId: 'keep-1', artistName: 'KEEP' },
    ]);
    service.friends.set([{ userId: 'rival-1', artistName: 'RIVAL' }]);

    const promise = service.blockUser('rival-1');
    const putReq = httpMock.expectOne((r) =>
      r.method === 'PUT' && r.url.includes('/users/test-id/blocks/rival-1')
    );
    putReq.flush({ success: true });
    // blockUser awaits the PUT, then issues the blocklist GET — yield to the
    // microtask queue so that follow-up request is registered.
    await Promise.resolve();
    const getReq = httpMock.expectOne((r) =>
      r.method === 'GET' && r.url.includes('/users/test-id/blocks')
    );
    getReq.flush([{ userId: 'rival-1', artistName: 'RIVAL' }]);
    await promise;

    expect(service.onlineUsers().map((u) => u.userId)).toEqual(['keep-1']);
    expect(service.friends()).toHaveLength(0);
    expect(service.blockedUsers()).toEqual([{ userId: 'rival-1', artistName: 'RIVAL' }]);
  });

  it('unblocks a user via REST', async () => {
    const httpMock = TestBed.inject(HttpTestingController);
    service.blockedUsers.set([{ userId: 'rival-1', artistName: 'RIVAL' }]);

    const promise = service.unblockUser('rival-1');
    const delReq = httpMock.expectOne((r) =>
      r.method === 'DELETE' && r.url.includes('/users/test-id/blocks/rival-1')
    );
    delReq.flush({ success: true });
    await Promise.resolve();
    const getReq = httpMock.expectOne((r) =>
      r.method === 'GET' && r.url.includes('/users/test-id/blocks')
    );
    getReq.flush([]);
    await promise;

    expect(service.blockedUsers()).toHaveLength(0);
  });
});
