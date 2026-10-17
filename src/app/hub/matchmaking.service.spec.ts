import { TestBed } from '@angular/core/testing';
import { MatchmakingService } from './matchmaking.service';
import { GameService } from './game.service';
import { UserProfileService } from '../services/user-profile.service';
import { NotificationService } from '../services/notification.service';
import { HapticService } from '../services/haptic.service';
import { TokenService } from '../services/token.service';
import { ShareableInviteService } from '../services/shareable-invite.service';
import { signal } from '@angular/core';
import { io } from 'socket.io-client';

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

describe('MatchmakingService resolved-match lobby flows', () => {
  let service: MatchmakingService;
  let handlers = new Map<string, (payload: any) => void>();
  let emitMock: jest.Mock;

  const tokenServiceMock = {
    jwtToken: jest.fn(() => 'jwt-token'),
  };
  const profileMock = {
    profile: () => ({
      id: 'user-1',
      artistName: 'Artist One',
      primaryGenre: 'Hip Hop',
      avatarImage: '',
    }),
  };
  const notifyMock = { show: jest.fn() };
  const hapticMock = { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() };
  const gameServiceMock = {
    getGameById: () => undefined,
    listGamesSync: () => [],
    loadFeedIfNeeded: jest.fn(),
  };
  const sharesMock = {
    buildShareIntent: jest.fn(),
    buildPublicShareUrl: jest.fn(),
    share: jest.fn(),
    lastIssued: signal(null),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = new Map();
    emitMock = jest.fn();

    const fakeSocket: any = {
      on: jest.fn((event: string, cb: (payload: any) => void) => {
        handlers.set(event, cb);
        return fakeSocket;
      }),
      emit: emitMock,
      disconnect: jest.fn(),
      connected: true,
      id: 'sock-1',
    };
    (io as unknown as jest.Mock).mockReturnValue(fakeSocket);

    TestBed.configureTestingModule({
      providers: [
        MatchmakingService,
        { provide: GameService, useValue: gameServiceMock },
        { provide: UserProfileService, useValue: profileMock },
        { provide: NotificationService, useValue: notifyMock },
        { provide: HapticService, useValue: hapticMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: ShareableInviteService, useValue: sharesMock },
      ],
    });

    service = TestBed.inject(MatchmakingService);
    // Constructor uses an effect (token → connectSocket); flush it so the
    // socket handlers actually register before we fire events at them.
    TestBed.flushEffects();
  });

  /** Fire an inbound socket event as if the server sent it. */
  function serverEvent(event: string, payload: any): void {
    handlers.get(event)?.(payload);
  }

  it('adopts a queue-matched lobby from lobby_list when the cache was empty', () => {
    // The matchmaking flow: match_found provisions a party and we emit
    // join_party, but the party is NOT in the local directory cache yet
    // (fresh login / reconnect). joinResolvedLobby's eager myLobby set can't
    // fire — this is the exact race the old lobby_list handler lost: it only
    // updated myLobby when myLobby was ALREADY set.
    serverEvent('match_found', {
      opponentId: 'user-2',
      gameId: 'street-fighter-alpha-3-elite-master',
      partyId: 'party-42',
    });
    expect(emitMock).toHaveBeenCalledWith('join_party', { partyId: 'party-42' });
    expect(service.myLobby()).toBeNull(); // cache empty → no eager set

    // The authoritative directory now includes the provisioned party.
    serverEvent('lobby_list', [
      {
        partyId: 'party-42',
        leaderId: 'user-2',
        members: [
          { userId: 'user-2', artistName: 'Artist Two' },
          { userId: 'user-1', artistName: 'Artist One' },
        ],
        gameId: 'street-fighter-alpha-3-elite-master',
      },
    ]);

    expect(service.myLobby()?.id).toBe('party-42');
    expect(service.myLobby()?.playerIds).toEqual(['user-2', 'user-1']);
    expect(service.isSearching()).toBe(false);
    expect(service.isHost()).toBe(false);
  });

  it('joins the provisioned party on challenge accept and records the resolved id', () => {
    serverEvent('challenge_lobby_ready', {
      partyId: 'party-9',
      gameId: 'tekken-3-elite',
      challengeId: '12',
      challengerId: 'user-2',
      opponentId: 'user-1',
    });
    expect(emitMock).toHaveBeenCalledWith('join_party', { partyId: 'party-9' });
    // resolvedMatchLobbyId is private — observable effect: endCurrentMatch
    // must tear the room down. myLobby is eager-set by challenge_lobby_ready,
    // so endCurrentMatch leaves the resolved party.
    expect(service.myLobby()?.gameId).toBe('tekken-3-elite');
    service.endCurrentMatch();
    expect(emitMock).toHaveBeenCalledWith('leave_party', { partyId: 'party-9' });
    expect(service.myLobby()).toBeNull();
  });

  it('matches the direct join path (lobby already cached) without races', () => {
    // Lobby is already in the directory before the accept event arrives.
    serverEvent('lobby_list', [
      {
        partyId: 'party-5',
        leaderId: 'user-2',
        members: [
          { userId: 'user-2', artistName: 'Artist Two' },
          { userId: 'user-1', artistName: 'Artist One' },
        ],
        gameId: 'ev-io-web-elite',
      },
    ]);
    expect(service.myLobby()).toBeNull(); // we're not in it yet

    serverEvent('challenge_lobby_ready', {
      partyId: 'party-5',
      gameId: 'ev-io-web-elite',
      challengeId: '3',
      challengerId: 'user-2',
      opponentId: 'user-1',
    });
    expect(service.myLobby()?.id).toBe('party-5');
    expect(emitMock).toHaveBeenCalledWith('join_party', { partyId: 'party-5' });
  });

  it('clears a resolved lobby on party_ended', () => {
    serverEvent('challenge_lobby_ready', {
      partyId: 'party-21',
      gameId: 'shell-shockers-web-elite',
      challengeId: '99',
      challengerId: 'user-2',
      opponentId: 'user-1',
    });
    serverEvent('party_ended', { partyId: 'party-21', reason: 'player_left' });
    expect(service.myLobby()).toBeNull();
    expect(service.isSearching()).toBe(false);
  });
});