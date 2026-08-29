import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
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
});
