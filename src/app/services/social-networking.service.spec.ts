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
  connected: true as boolean,
  on: jest.fn((event: string, handler: (data: any) => void) => {
    socketHandlers.set(event, handler);
  }),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
};

/** Fire an inbound socket event as if the server sent it. */
function serverEvent(event: string, payload?: any): void {
  socketHandlers.get(event)?.(payload);
}

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

describe('SocialNetworkingService', () => {
  let service: SocialNetworkingService;

  beforeEach(() => {
    socketHandlers.clear();
    mockSocket.on.mockClear();
    mockSocket.emit.mockClear();
    mockSocket.disconnect.mockClear();
    mockSocket.connected = true;

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
            markFriendRequestsRead: jest.fn(),
            removeFriendRequestsFrom: jest.fn(),
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

  it('surfaces a friend who just went live, with the token to watch', () => {
    const show = jest.fn();
    (service as any).notifications = { show };

    serverEvent('friend_went_live', {
      hostId: 42,
      hostDisplayName: 'NOVA',
      platform: 'smuve',
      gameId: 'tekken-3-elite',
      shareToken: 'tok_friend',
      ts: 1700000000000,
    });

    expect(service.friendWentLive()).toEqual({
      hostId: '42',
      hostDisplayName: 'NOVA',
      platform: 'smuve',
      gameId: 'tekken-3-elite',
      shareToken: 'tok_friend',
      ts: 1700000000000,
    });
    expect(show).toHaveBeenCalledWith(
      'NOVA IS LIVE - OPEN LIVE NOW TO WATCH',
      'info'
    );
  });

  it('ignores a go-live alert that carries no share token', () => {
    serverEvent('friend_went_live', { hostId: 42, hostDisplayName: 'NOVA' });
    expect(service.friendWentLive()).toBeNull();
  });

  it('drops the go-live card when that broadcast ends', () => {
    serverEvent('friend_went_live', {
      hostId: 42,
      hostDisplayName: 'NOVA',
      shareToken: 'tok_friend',
    });
    expect(service.friendWentLive()?.shareToken).toBe('tok_friend');

    // A different room closing must not dismiss the card we are showing.
    serverEvent('friend_live_ended', { shareToken: 'tok_other' });
    expect(service.friendWentLive()?.shareToken).toBe('tok_friend');

    serverEvent('friend_live_ended', { shareToken: 'tok_friend' });
    expect(service.friendWentLive()).toBeNull();
  });

  it('binds the inbox as soon as the authenticated socket is created', () => {
    expect(TestBed.inject(ChallengeInboxService).bindSocket).toHaveBeenCalledWith(mockSocket);
  });

  it('discards queued messages on logout instead of sending them from the next account', () => {
    mockSocket.connected = false;
    service.sendMessage('other-user', 'private unsent message');
    const token = TestBed.inject(TokenService).jwtToken as any;
    token.set(null);
    TestBed.flushEffects();
    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(TestBed.inject(ChallengeInboxService).bindSocket).toHaveBeenCalledWith(null);
    token.set('new-account-token');
    TestBed.flushEffects();
    mockSocket.connected = true;
    serverEvent('connect');
    expect(mockSocket.emit).not.toHaveBeenCalledWith('send_message', {
      toUserId: 'other-user', message: 'private unsent message',
    });
  });

  it('queues DMs sent while the socket is down and flushes them on reconnect', () => {
    mockSocket.connected = false;
    service.sendMessage('other-user', 'hello offline');
    // Queued locally, NOT emitted into the void.
    expect(mockSocket.emit).not.toHaveBeenCalledWith('send_message', {
      toUserId: 'other-user',
      message: 'hello offline',
    });
    expect(service.messages().some((m) => m.message === 'hello offline')).toBe(
      true
    );

    // Socket comes back — the connect handler flushes the queue.
    mockSocket.connected = true;
    serverEvent('connect');
    expect(mockSocket.emit).toHaveBeenCalledWith('send_message', {
      toUserId: 'other-user',
      message: 'hello offline',
    });
  });

  it('emits DMs immediately when the socket is live', () => {
    mockSocket.connected = true;
    service.sendMessage('other-user', 'hello online');
    expect(mockSocket.emit).toHaveBeenCalledWith('send_message', {
      toUserId: 'other-user',
      message: 'hello online',
    });
  });

  it('publishes live identity with register_presence on every (re)connect', () => {
    service.setPresenceExtrasProvider(() => ({
      live: true,
      livePlatform: 'smuve',
      liveShareToken: 'share-token',
      liveGameId: 'halo',
    }));

    serverEvent('connect');

    expect(mockSocket.emit).toHaveBeenCalledWith('register_presence', {
      userId: 'test-id',
      metadata: expect.objectContaining({
        artistName: 'Test Artist',
        live: true,
        liveShareToken: 'share-token',
      }),
    });
  });

  it('queues a status update while offline and flushes it after reconnect', () => {
    mockSocket.connected = false;
    service.updateStatus({ live: true, liveShareToken: 'share-token' });
    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'update_status',
      expect.anything()
    );

    mockSocket.connected = true;
    serverEvent('connect');

    expect(mockSocket.emit).toHaveBeenCalledWith('update_status', {
      userId: 'test-id',
      metadata: expect.objectContaining({
        live: true,
        liveShareToken: 'share-token',
      }),
    });
  });

  it('merges live presence onto the friends directory for discovery', () => {
    service.friends.set([
      { userId: 'friend-1', artistName: 'FRIEND', status: 'accepted' },
    ]);
    service.onlineUsers.set([
      {
        userId: 'friend-1',
        artistName: 'FRIEND',
        live: true,
        livePlatform: 'smuve',
        liveShareToken: 'share-token',
        liveGameId: 'halo',
      },
    ]);

    expect(service.friendsDirectory()[0]).toEqual(
      expect.objectContaining({
        userId: 'friend-1',
        live: true,
        livePlatform: 'smuve',
        liveShareToken: 'share-token',
        liveGameId: 'halo',
      })
    );
    expect(service.liveNow()).toHaveLength(1);
  });

  it('filters blocked users from every users_online broadcast', () => {
    service.blockedUsers.set([{ userId: 'rival-1', artistName: 'RIVAL' }]);

    serverEvent('users_online', [
      { userId: 'test-id', artistName: 'Test Artist' },
      { userId: 'rival-1', artistName: 'RIVAL' },
      { userId: 'keep-1', artistName: 'KEEP' },
    ]);

    expect(service.onlineUsers().map((u) => u.userId)).toEqual(['keep-1']);
  });

  it('clears loaded friend-request notifications when the server marks them read', () => {
    serverEvent('friend_requests_read');

    expect(
      TestBed.inject(ChallengeInboxService).markFriendRequestsRead,
    ).toHaveBeenCalled();
  });

  it('removes a resolved friend request from the loaded inbox', () => {
    serverEvent('friend_request_resolved', { otherUserId: 'sender-1' });

    expect(
      TestBed.inject(ChallengeInboxService).removeFriendRequestsFrom,
    ).toHaveBeenCalledWith('sender-1');
    // The other side's friends list also needs to reconcile after a resolution.
    const request = TestBed.inject(HttpTestingController).expectOne(
      (r) => r.method === 'GET' && r.url.endsWith('/users/test-id/friends'),
    );
    request.flush([]);
  });

  it('reloads friends when a friend request arrives over the socket', async () => {
    serverEvent('friend_request_received', { fromUserId: 'sender-1' });

    const request = TestBed.inject(HttpTestingController).expectOne(
      (r) => r.method === 'GET' && r.url.endsWith('/users/test-id/friends'),
    );
    request.flush([
      {
        userId: 'sender-1',
        artistName: 'SENDER',
        status: 'pending',
        direction: 'incoming',
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.friends()).toEqual([
      expect.objectContaining({
        userId: 'sender-1',
        status: 'pending',
        direction: 'incoming',
      }),
    ]);
  });

  it('hides live broadcasts from blocked users', () => {
    service.blockedUsers.set([{ userId: 'rival-1', artistName: 'RIVAL' }]);
    service.onlineUsers.set([
      {
        userId: 'rival-1',
        artistName: 'RIVAL',
        live: true,
        liveShareToken: 'tok-a',
      },
      {
        userId: 'keep-1',
        artistName: 'KEEP',
        live: true,
        liveShareToken: 'tok-b',
      },
    ]);

    expect(service.liveNow().map((u) => u.userId)).toEqual(['keep-1']);
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

    expect(service.acceptNeuralSyncRequest('rival-1')).toBe(true);

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'neural_sync_approve',
      expect.objectContaining({ toUserId: 'rival-1' })
    );
    expect(service.pendingNeuralSync()).toBeNull();
  });

  it('reports an unsent neural sync approval instead of pretending', () => {
    socketHandlers.get('neural_sync_invite')?.({
      fromUserId: 'rival-1',
      fromUserName: 'RIVAL',
    });
    (service as any).socket = undefined;

    expect(service.acceptNeuralSyncRequest('rival-1')).toBe(false);

    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'neural_sync_approve',
      expect.anything()
    );
    expect(service.neuralSyncStatus()).not.toBe('syncing');
  });

  it('stops claiming a sync in progress when the approval is never acknowledged', () => {
    jest.useFakeTimers();
    try {
      expect(service.acceptNeuralSyncRequest('rival-1')).toBe(true);
      expect(service.neuralSyncStatus()).toBe('syncing');

      jest.advanceTimersByTime(10_000);

      expect(service.neuralSyncStatus()).toBe('idle');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a synced status when the server confirms before the timeout', () => {
    jest.useFakeTimers();
    try {
      service.acceptNeuralSyncRequest('rival-1');
      socketHandlers.get('neural_sync_complete')?.({
        fromUserName: 'RIVAL',
        syncData: {},
      });
      expect(service.neuralSyncStatus()).toBe('synced');

      jest.advanceTimersByTime(10_000);

      expect(service.neuralSyncStatus()).toBe('synced');
    } finally {
      jest.useRealTimers();
    }
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

  it('toggleMicrophone is an alias for toggleMic that flips the mic track', () => {
    // Track objects are stable references across getAudioTracks() calls,
    // mirroring real MediaStream behavior — the service must flip the same
    // track instance it reads.
    const audioTrack = { enabled: true };
    const fakeStream = {
      getAudioTracks: jest.fn(() => [audioTrack]),
      getVideoTracks: jest.fn(() => []),
      getTracks: jest.fn(() => []),
    } as any;
    service.localStream.set(fakeStream);

    expect(service.micEnabled()).toBe(true);
    service.toggleMicrophone();
    expect(service.micEnabled()).toBe(false);
    expect(audioTrack.enabled).toBe(false);

    service.toggleMicrophone();
    expect(service.micEnabled()).toBe(true);
    expect(audioTrack.enabled).toBe(true);
  });

  it('toggleCamera flips the video track without touching the stream', () => {
    // Stable track reference across getVideoTracks() calls, mirroring
    // real MediaStream behavior.
    const videoTrack = { enabled: true };
    const fakeStream = {
      getAudioTracks: jest.fn(() => []),
      getVideoTracks: jest.fn(() => [videoTrack]),
      getTracks: jest.fn(() => []),
    } as any;
    service.localStream.set(fakeStream);

    expect(service.cameraEnabled()).toBe(true);
    service.toggleCamera();
    expect(service.cameraEnabled()).toBe(false);
    expect(videoTrack.enabled).toBe(false);
    expect(service.localStream()).toBe(fakeStream);
  });
});

describe('SocialNetworkingService video source (camera ↔ screen)', () => {
  let service: SocialNetworkingService;
  let getUserMedia: jest.Mock;
  let getDisplayMedia: jest.Mock;
  let originalMediaDevices: MediaDevices | undefined;
  let OriginalMediaStream: any;

  const makeTrack = (kind: 'audio' | 'video', id: string) => ({
    kind,
    id,
    enabled: true,
    stop: jest.fn(),
    addEventListener: jest.fn(),
  });
  const fakeMedia = (tracks: any[]) => ({
    getTracks: () => [...tracks],
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  });

  beforeEach(() => {
    originalMediaDevices = (navigator as any).mediaDevices;
    getUserMedia = jest.fn();
    getDisplayMedia = jest.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia, getDisplayMedia },
      configurable: true,
    });
    OriginalMediaStream = (global as any).MediaStream;
    (global as any).MediaStream = class {
      tracks: any[];
      constructor(tracks: any[] = []) {
        this.tracks = [...tracks];
      }
      getTracks() {
        return [...this.tracks];
      }
      getVideoTracks() {
        return this.tracks.filter((t: any) => t.kind === 'video');
      }
      getAudioTracks() {
        return this.tracks.filter((t: any) => t.kind === 'audio');
      }
      addTrack(t: any) {
        this.tracks.push(t);
      }
    };
    service = TestBed.inject(SocialNetworkingService);
    (service.screenShareSupported as any).set(true);
    service.isStreaming.set(false);
    service.localStream.set(null);
    service.videoSource.set('camera');
  });

  afterEach(() => {
    service.stopStream();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
    (global as any).MediaStream = OriginalMediaStream;
  });

  it('starts on the pre-picked screen source with mic plus system audio', async () => {
    const screenVideo = makeTrack('video', 'screen-v');
    const sysAudio = makeTrack('audio', 'sys-a');
    getDisplayMedia.mockResolvedValue(fakeMedia([screenVideo, sysAudio]));
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([mic]));

    service.videoSource.set('screen');
    await service.startStream('S.M.U.V.E.');

    expect(getDisplayMedia).toHaveBeenCalled();
    expect(service.videoSource()).toBe('screen');
    expect(service.localStream()!.getVideoTracks()[0]).toBe(screenVideo);
    expect(service.localStream()!.getAudioTracks()).toEqual(
      expect.arrayContaining([mic, sysAudio])
    );
  });

  it('previews local capture without marking the session live', async () => {
    const camVideo = makeTrack('video', 'cam-preview');
    const mic = makeTrack('audio', 'mic-preview');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));

    await expect(service.startPreview()).resolves.toBe(true);

    expect(service.previewActive()).toBe(true);
    expect(service.isStreaming()).toBe(false);
    expect(service.currentPlatform()).toBeNull();
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo);
  });

  it('switches source in preview and reuses that capture when going live', async () => {
    const camVideo = makeTrack('video', 'cam-preview');
    const mic = makeTrack('audio', 'mic-preview');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startPreview();

    const screenVideo = makeTrack('video', 'screen-preview');
    getDisplayMedia.mockResolvedValue(fakeMedia([screenVideo]));
    await service.setVideoSource('screen');
    expect(service.previewActive()).toBe(true);
    expect(service.videoSource()).toBe('screen');

    await service.startStream('S.M.U.V.E.');

    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(service.isStreaming()).toBe(true);
    expect(service.previewActive()).toBe(false);
    expect(service.localStream()!.getVideoTracks()[0]).toBe(screenVideo);
  });

  it('releases a preview without starting a broadcast', async () => {
    const camVideo = makeTrack('video', 'cam-preview');
    const mic = makeTrack('audio', 'mic-preview');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startPreview();

    service.stopPreview();

    expect(service.previewActive()).toBe(false);
    expect(service.isStreaming()).toBe(false);
    expect(service.localStream()).toBeNull();
    expect(camVideo.stop).toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalled();
  });

  it('shares one capture between double-clicked preview starts', async () => {
    let resolveMedia!: (stream: any) => void;
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        resolveMedia = resolve;
      })
    );
    const camVideo = makeTrack('video', 'cam-shared');
    const mic = makeTrack('audio', 'mic-shared');

    const first = service.startPreview();
    const second = service.startPreview();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    resolveMedia(fakeMedia([camVideo, mic]));

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(service.previewActive()).toBe(true);
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo);
  });

  it('refuses a preview while a source switch is in flight', async () => {
    service.switchingSource.set(true);

    await expect(service.startPreview()).resolves.toBe(false);

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(service.previewStarting()).toBe(false);
  });

  it('coalesces immediate double-clicked preview starts', async () => {
    const camVideo = makeTrack('video', 'cam-immediate');
    const mic = makeTrack('audio', 'mic-immediate');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));

    const first = service.startPreview();
    const second = service.startPreview();

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(service.previewActive()).toBe(true);
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo);
  });

  it('releases a capture that resolves after preview is stopped', async () => {
    let resolveMedia!: (stream: any) => void;
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        resolveMedia = resolve;
      })
    );
    const camVideo = makeTrack('video', 'cam-late');
    const mic = makeTrack('audio', 'mic-late');

    const preview = service.startPreview();
    service.stopPreview();
    resolveMedia(fakeMedia([camVideo, mic]));

    await expect(preview).resolves.toBe(false);
    expect(service.previewActive()).toBe(false);
    expect(service.previewCancelled()).toBe(true);
    expect(service.localStream()).toBeNull();
    expect(camVideo.stop).toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalled();
  });

  it('clears cancellation state when a new preview starts', async () => {
    service.previewCancelled.set(true);
    getUserMedia.mockResolvedValue(
      fakeMedia([makeTrack('video', 'cam-fresh'), makeTrack('audio', 'mic-fresh')])
    );

    await expect(service.startPreview()).resolves.toBe(true);

    expect(service.previewCancelled()).toBe(false);
    expect(service.previewActive()).toBe(true);
  });

  it('aborts a stream start stopped while capture is pending', async () => {
    let resolveMedia!: (stream: any) => void;
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        resolveMedia = resolve;
      })
    );
    const camVideo = makeTrack('video', 'cam-stream-late');
    const mic = makeTrack('audio', 'mic-stream-late');

    const started = service.startStream('S.M.U.V.E.');
    service.stopStream();
    resolveMedia(fakeMedia([camVideo, mic]));

    await expect(started).resolves.toBe(false);
    expect(service.isStreaming()).toBe(false);
    expect(service.localStream()).toBeNull();
    expect(camVideo.stop).toHaveBeenCalled();
  });

  it('waits for an in-flight preview and reuses it instead of capturing twice', async () => {
    let resolveMedia!: (stream: any) => void;
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        resolveMedia = resolve;
      })
    );
    const camVideo = makeTrack('video', 'cam-go-live');
    const mic = makeTrack('audio', 'mic-go-live');

    const preview = service.startPreview();
    const started = service.startStream('S.M.U.V.E.');
    resolveMedia(fakeMedia([camVideo, mic]));

    await expect(preview).resolves.toBe(true);
    await expect(started).resolves.toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(service.previewActive()).toBe(false);
    expect(service.isStreaming()).toBe(true);
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo);
  });

  it('falls back to camera when the pre-stream screen picker is refused', async () => {
    getDisplayMedia.mockRejectedValue(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    );
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-2');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));

    service.videoSource.set('screen');
    await service.startStream('S.M.U.V.E.');

    expect(service.videoSource()).toBe('camera');
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo);
    expect(service.streamError()).toBeNull();
  });

  it('retries capture and clears the error once the camera is granted', async () => {
    getUserMedia.mockRejectedValue(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    );
    await service.startStream('S.M.U.V.E.');
    expect(service.localStream()).toBeNull();
    expect(service.streamError()).toContain('CAMERA_OR_MIC_DENIED');

    const camVideo = makeTrack('video', 'cam-retry');
    const mic = makeTrack('audio', 'mic-retry');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));

    await expect(service.retryHostMedia()).resolves.toBe(true);
    expect(service.streamError()).toBeNull();
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo);
  });

  it('reports a still-denied retry instead of pretending it worked', async () => {
    getUserMedia.mockRejectedValue(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    );
    await service.startStream('S.M.U.V.E.');

    await expect(service.retryHostMedia()).resolves.toBe(false);
    expect(service.localStream()).toBeNull();
    expect(service.streamError()).toContain('CAMERA_OR_MIC_DENIED');
  });

  it('flags a hard-blocked camera so the host knows a retry cannot re-prompt', async () => {
    const query = jest.fn(async () => ({
      state: 'denied' as PermissionState,
    }));
    Object.defineProperty(navigator, 'permissions', {
      value: { query },
      configurable: true,
    });
    getUserMedia.mockRejectedValue(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    );

    try {
      await service.startStream('S.M.U.V.E.');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(service.captureBlocked()).toBe(true);
      expect(query).toHaveBeenCalledWith({ name: 'camera' });
    } finally {
      delete (navigator as unknown as { permissions?: unknown }).permissions;
    }
  });

  it('stays unblocked when the permission can still prompt', async () => {
    const query = jest.fn(async () => ({
      state: 'prompt' as PermissionState,
    }));
    Object.defineProperty(navigator, 'permissions', {
      value: { query },
      configurable: true,
    });
    getUserMedia.mockRejectedValue(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    );

    try {
      await service.startStream('S.M.U.V.E.');
      await new Promise((resolve) => setTimeout(resolve, 0));
      // A refusal that can still prompt is not a block: keep RETRY honest.
      expect(service.captureBlocked()).toBe(false);
    } finally {
      delete (navigator as unknown as { permissions?: unknown }).permissions;
    }
  });

  it('clears the block flag once capture succeeds', async () => {
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: jest.fn(async () => ({ state: 'denied' as PermissionState })),
      },
      configurable: true,
    });

    try {
      getUserMedia.mockRejectedValue(
        Object.assign(new Error('denied'), { name: 'NotAllowedError' })
      );
      await service.startStream('S.M.U.V.E.');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(service.captureBlocked()).toBe(true);

      getUserMedia.mockResolvedValue(fakeMedia([makeTrack('video', 'cam-ok')]));
      await expect(service.retryHostMedia()).resolves.toBe(true);
      expect(service.captureBlocked()).toBe(false);
    } finally {
      delete (navigator as unknown as { permissions?: unknown }).permissions;
    }
  });

  it('switches camera → screen live, keeps the mic and notifies viewers', async () => {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');
    const onUpdate = jest.fn();
    service.onHostStreamReplaced(onUpdate);

    const screenVideo = makeTrack('video', 'screen-v');
    const sysAudio = makeTrack('audio', 'sys-a');
    getDisplayMedia.mockResolvedValue(fakeMedia([screenVideo, sysAudio]));
    await service.setVideoSource('screen');

    expect(service.videoSource()).toBe('screen');
    expect(service.localStream()!.getVideoTracks()[0]).toBe(screenVideo);
    expect(service.localStream()!.getAudioTracks()).toEqual(
      expect.arrayContaining([mic, sysAudio])
    );
    expect(camVideo.stop).toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ videoSource: 'screen' })
    );
    expect(onUpdate.mock.calls[0][0].stream.getVideoTracks()[0]).toBe(
      screenVideo
    );
  });

  it('switches screen → camera and drops system audio but keeps the mic', async () => {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');

    const screenVideo = makeTrack('video', 'screen-v');
    const sysAudio = makeTrack('audio', 'sys-a');
    getDisplayMedia.mockResolvedValue(fakeMedia([screenVideo, sysAudio]));
    await service.setVideoSource('screen');

    const camVideo2 = makeTrack('video', 'cam-v2');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo2]));
    const onUpdate = jest.fn();
    service.onHostStreamReplaced(onUpdate);
    await service.setVideoSource('camera');

    expect(service.videoSource()).toBe('camera');
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo2);
    expect(service.localStream()!.getAudioTracks()).toEqual([mic]);
    expect(sysAudio.stop).toHaveBeenCalled();
    expect(mic.stop).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        videoSource: 'camera',
        screenAudioOnly: false,
      })
    );
  });

  it('keeps the current source when the mid-show picker is cancelled', async () => {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');
    getDisplayMedia.mockRejectedValue(
      Object.assign(new Error('cancelled'), { name: 'NotAllowedError' })
    );

    await service.setVideoSource('screen');

    expect(service.videoSource()).toBe('camera');
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo);
    expect(service.streamError()).toBeNull();
  });

  it('refuses screen on browsers without display capture', async () => {
    (service.screenShareSupported as any).set(false);
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');

    await service.setVideoSource('screen');

    expect(service.videoSource()).toBe('camera');
    expect(service.streamError()).toContain('SCREEN_SHARE_UNSUPPORTED');
    expect(getDisplayMedia).not.toHaveBeenCalled();
  });

  it('coalesces a duplicate switch while one is already in flight', async () => {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');

    let resolveDisplay!: (value: any) => void;
    getDisplayMedia.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDisplay = resolve;
      })
    );
    const first = service.setVideoSource('screen');
    expect(service.switchingSource()).toBe(true);
    // Same destination, still the old source: never open a second picker.
    const duplicate = service.setVideoSource('screen');
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);

    const screenVideo = makeTrack('video', 'screen-v');
    resolveDisplay(fakeMedia([screenVideo]));
    await Promise.all([first, duplicate]);
    expect(service.switchingSource()).toBe(false);
    expect(service.localStream()!.getVideoTracks()[0]).toBe(screenVideo);
  });

  it('does not reopen a cancelled picker for a duplicate request', async () => {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');

    let rejectDisplay!: (reason: unknown) => void;
    getDisplayMedia.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectDisplay = reject;
      })
    );
    const first = service.setVideoSource('screen');
    const duplicate = service.setVideoSource('screen');
    rejectDisplay(
      Object.assign(new Error('cancelled'), { name: 'NotAllowedError' })
    );
    await Promise.all([first, duplicate]);

    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(service.videoSource()).toBe('camera');
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo);
    expect(service.switchingSource()).toBe(false);
  });

  it('runs the latest opposite switch after the in-flight picker finishes', async () => {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');

    let resolveDisplay!: (value: any) => void;
    getDisplayMedia.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDisplay = resolve;
      })
    );
    const toScreen = service.setVideoSource('screen');
    const backToCamera = service.setVideoSource('camera');

    const camVideo2 = makeTrack('video', 'cam-v2');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo2]));
    const screenVideo = makeTrack('video', 'screen-v');
    resolveDisplay(fakeMedia([screenVideo]));
    await Promise.all([toScreen, backToCamera]);

    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(service.videoSource()).toBe('camera');
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo2);
    expect(screenVideo.stop).toHaveBeenCalled();
    expect(service.switchingSource()).toBe(false);
  });

  it('releases a late-resolving switch when the session ends first', async () => {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');

    let resolveDisplay!: (value: any) => void;
    getDisplayMedia.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDisplay = resolve;
      })
    );
    const pending = service.setVideoSource('screen');
    service.stopStream();
    const screenVideo = makeTrack('video', 'screen-v');
    const sysAudio = makeTrack('audio', 'sys-a');
    resolveDisplay(fakeMedia([screenVideo, sysAudio]));
    await pending;

    // Nothing published into the dead session; the fresh tracks released.
    expect(service.localStream()).toBeNull();
    expect(service.videoSource()).toBe('camera');
    expect(screenVideo.stop).toHaveBeenCalled();
    expect(sysAudio.stop).toHaveBeenCalled();
  });

  it('ignores the ended event of a replaced screen track', async () => {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');

    const screenVideo1 = makeTrack('video', 'screen-v1');
    getDisplayMedia.mockResolvedValue(fakeMedia([screenVideo1]));
    await service.setVideoSource('screen');
    const endedStale = screenVideo1.addEventListener.mock.calls.find(
      ([event]: any[]) => event === 'ended'
    )?.[1];
    expect(endedStale).toBeDefined();

    const camVideo2 = makeTrack('video', 'cam-v2');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo2]));
    await service.setVideoSource('camera');

    // Back on screen with a fresh track — the stale one's goodbye
    // must not yank this session anywhere.
    const screenVideo2 = makeTrack('video', 'screen-v2');
    getDisplayMedia.mockResolvedValue(fakeMedia([screenVideo2]));
    await service.setVideoSource('screen');
    const capturesBefore = getUserMedia.mock.calls.length;
    endedStale();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.videoSource()).toBe('screen');
    expect(service.localStream()!.getVideoTracks()[0]).toBe(screenVideo2);
    expect(getUserMedia.mock.calls.length).toBe(capturesBefore);
  });

  it('falls back to camera when the user stops sharing in the browser', async () => {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');

    const screenVideo = makeTrack('video', 'screen-v');
    getDisplayMedia.mockResolvedValue(fakeMedia([screenVideo]));
    await service.setVideoSource('screen');
    expect(service.videoSource()).toBe('screen');

    const camVideo2 = makeTrack('video', 'cam-v2');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo2]));
    const ended = screenVideo.addEventListener.mock.calls.find(
      ([event]: any[]) => event === 'ended'
    )?.[1];
    expect(ended).toBeDefined();
    ended();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.videoSource()).toBe('camera');
    expect(service.localStream()!.getVideoTracks()[0]).toBe(camVideo2);
  });
});

describe('SocialNetworkingService screen audio only', () => {
  let service: SocialNetworkingService;
  let getUserMedia: jest.Mock;
  let getDisplayMedia: jest.Mock;
  let originalMediaDevices: MediaDevices | undefined;
  let OriginalMediaStream: any;

  const makeTrack = (kind: 'audio' | 'video', id: string) => ({
    kind,
    id,
    enabled: true,
    stop: jest.fn(),
    addEventListener: jest.fn(),
  });
  const fakeMedia = (tracks: any[]) => ({
    getTracks: () => [...tracks],
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  });

  beforeEach(() => {
    originalMediaDevices = (navigator as any).mediaDevices;
    getUserMedia = jest.fn();
    getDisplayMedia = jest.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia, getDisplayMedia },
      configurable: true,
    });
    OriginalMediaStream = (global as any).MediaStream;
    (global as any).MediaStream = class {
      tracks: any[];
      constructor(tracks: any[] = []) {
        this.tracks = [...tracks];
      }
      getTracks() {
        return [...this.tracks];
      }
      getVideoTracks() {
        return this.tracks.filter((t: any) => t.kind === 'video');
      }
      getAudioTracks() {
        return this.tracks.filter((t: any) => t.kind === 'audio');
      }
      addTrack(t: any) {
        this.tracks.push(t);
      }
    };
    service = TestBed.inject(SocialNetworkingService);
    (service.screenShareSupported as any).set(true);
    service.isStreaming.set(false);
    service.localStream.set(null);
    service.videoSource.set('camera');
  });

  afterEach(() => {
    service.stopStream();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
    (global as any).MediaStream = OriginalMediaStream;
  });

  async function goScreenLive() {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');
    const screenVideo = makeTrack('video', 'screen-v');
    const sysAudio = makeTrack('audio', 'sys-a');
    getDisplayMedia.mockResolvedValue(fakeMedia([screenVideo, sysAudio]));
    await service.setVideoSource('screen');
    return { mic, sysAudio };
  }

  it('mutes the mic for viewers but leaves game sound playing', async () => {
    const { mic, sysAudio } = await goScreenLive();

    service.setScreenAudioOnly(true);

    expect(service.screenAudioOnly()).toBe(true);
    expect(mic.enabled).toBe(false);
    expect(sysAudio.enabled).toBe(true);
  });

  it('restores the mic when screen-audio-only is switched off', async () => {
    const { mic } = await goScreenLive();
    service.setScreenAudioOnly(true);
    expect(mic.enabled).toBe(false);

    service.setScreenAudioOnly(false);

    expect(mic.enabled).toBe(true);
  });

  it('keeps the mic back on camera even with the flag still set', async () => {
    const { mic } = await goScreenLive();
    service.setScreenAudioOnly(true);

    const camVideo2 = makeTrack('video', 'cam-v2');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo2]));
    await service.setVideoSource('camera');

    expect(service.videoSource()).toBe('camera');
    expect(mic.enabled).toBe(true);
  });

  it('no longer mutes game sound with the mic toggle', async () => {
    const { mic, sysAudio } = await goScreenLive();

    service.toggleMic();

    expect(service.micEnabled()).toBe(false);
    expect(mic.enabled).toBe(false);
    expect(sysAudio.enabled).toBe(true);
  });

  it('labels ledger voice as mic and anything else as system sound', async () => {
    const camVideo = makeTrack('video', 'cam-v');
    const mic = makeTrack('audio', 'mic-1');
    getUserMedia.mockResolvedValue(fakeMedia([camVideo, mic]));
    await service.startStream('S.M.U.V.E.');

    expect(service.audioRoleOf(mic)).toBe('mic');
    expect(service.audioRoleOf(makeTrack('audio', 'sys-a'))).toBe('system');
    expect(service.audioRoleOf(camVideo)).toBe('mic');
  });

  it('resets screen-audio-only when the stream stops', async () => {
    await goScreenLive();
    service.setScreenAudioOnly(true);

    service.stopStream();

    expect(service.screenAudioOnly()).toBe(false);
  });
});
