import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { createTestPattern } from './test-pattern';
import { BroadcastIngestService } from './broadcast-ingest.service';
import { SnackbarService } from './snackbar.service';
import { SocialNetworkingService } from './social-networking.service';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';
import { WhipPublisher } from './whip-publisher';

jest.mock('./test-pattern', () => ({
  createTestPattern: jest.fn(),
}));

const stream = {
  getVideoTracks: () => [{ kind: 'video' }],
  getAudioTracks: () => [{ kind: 'audio' }],
} as unknown as MediaStream;

const httpPost = jest.fn();
const httpGet = jest.fn();
const httpDelete = jest.fn();
const primeAudioContext = jest.fn();
const closePrimedAudioContext = jest.fn();
const whipStart = jest.fn(async () => true);
const whipStop = jest.fn(async () => undefined);
const whipReplaceTracks = jest.fn();
const testPattern = {
  stream,
  stop: jest.fn(),
};

beforeEach(() => {
  TestBed.resetTestingModule();
  httpPost.mockReset();
  httpGet.mockReset();
  httpDelete.mockReset();
  primeAudioContext.mockReset();
  closePrimedAudioContext.mockReset();
  whipStart.mockReset().mockResolvedValue(true);
  whipStop.mockReset().mockResolvedValue(undefined);
  whipReplaceTracks.mockReset();
  testPattern.stop.mockReset();
  (createTestPattern as jest.Mock).mockReset().mockReturnValue(testPattern);

  TestBed.configureTestingModule({
    providers: [
      BroadcastIngestService,
      {
        provide: HttpClient,
        useValue: {
          post: httpPost,
          get: httpGet,
          delete: httpDelete,
        },
      },
      {
        provide: TokenService,
        useValue: { jwtToken: () => 'TKN' },
      },
      {
        provide: UserProfileService,
        useValue: { profile: () => ({ id: '' }) },
      },
      {
        provide: SocialNetworkingService,
        useValue: {
          videoSource: signal('camera'),
          localStream: signal(stream),
          isStreaming: signal(true),
        },
      },
      {
        provide: SnackbarService,
        useValue: {
          warning: jest.fn(),
          error: jest.fn(),
          success: jest.fn(),
          info: jest.fn(),
        },
      },
      {
        provide: WhipPublisher,
        useValue: {
          state: signal('idle'),
          error: signal(null),
          primeAudioContext,
          closePrimedAudioContext,
          start: whipStart,
          stop: whipStop,
          replaceTracks: whipReplaceTracks,
        },
      },
    ],
  });
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('BroadcastIngestService reconnect capture', () => {
  it('starts with the capture that exists after the relay session request', async () => {
    const switched = {
      getVideoTracks: () => [{ kind: 'video', id: 'screen' }],
      getAudioTracks: () => [{ kind: 'audio', id: 'mic' }],
    } as unknown as MediaStream;
    const social = TestBed.inject(SocialNetworkingService);
    httpPost.mockImplementationOnce(() => {
      social.localStream.set(switched);
      return of({ whipUrl: 'https://relay.test/whip' });
    });
    const service = TestBed.inject(BroadcastIngestService);

    expect(await service.start('twitch')).toBe(true);

    expect(whipStart).toHaveBeenCalledWith(
      'https://relay.test/whip',
      switched,
    );
  });

  it('re-applies a switch that finishes while WHIP is starting', async () => {
    const switched = {
      getVideoTracks: () => [{ kind: 'video', id: 'screen' }],
      getAudioTracks: () => [{ kind: 'audio', id: 'mic' }],
    } as unknown as MediaStream;
    const social = TestBed.inject(SocialNetworkingService);
    httpPost.mockReturnValueOnce(of({ whipUrl: 'https://relay.test/whip' }));
    whipStart.mockImplementationOnce(async () => {
      social.localStream.set(switched);
      return true;
    });
    const service = TestBed.inject(BroadcastIngestService);

    expect(await service.start('twitch')).toBe(true);

    expect(whipReplaceTracks).toHaveBeenCalledWith(switched);
  });
});

describe('BroadcastIngestService audio priming', () => {
  it('primes before the PUSH session request', async () => {
    httpPost.mockReturnValueOnce(of({ whipUrl: 'https://relay.test/whip' }));
    const service = TestBed.inject(BroadcastIngestService);

    expect(await service.start('twitch')).toBe(true);

    expect(primeAudioContext).toHaveBeenCalledTimes(1);
    expect(primeAudioContext.mock.invocationCallOrder[0]).toBeLessThan(
      httpPost.mock.invocationCallOrder[0],
    );
  });

  it('primes before the SELF-TEST session request', async () => {
    httpPost.mockReturnValueOnce(of(null));
    const service = TestBed.inject(BroadcastIngestService);

    await service.runSelfTest();

    expect(primeAudioContext).toHaveBeenCalledTimes(1);
    expect(primeAudioContext.mock.invocationCallOrder[0]).toBeLessThan(
      httpPost.mock.invocationCallOrder[0],
    );
  });

  it('closes the primed context when the PUSH session request fails', async () => {
    httpPost.mockReturnValueOnce(throwError(() => new Error('relay down')));
    const service = TestBed.inject(BroadcastIngestService);

    expect(await service.start('twitch')).toBe(false);

    expect(primeAudioContext).toHaveBeenCalledTimes(1);
    expect(closePrimedAudioContext).toHaveBeenCalledTimes(1);
  });

  it('closes the primed context when SELF-TEST cannot build a pattern', async () => {
    (createTestPattern as jest.Mock).mockReturnValueOnce(null);
    const service = TestBed.inject(BroadcastIngestService);

    await service.runSelfTest();

    expect(primeAudioContext).toHaveBeenCalledTimes(1);
    expect(closePrimedAudioContext).toHaveBeenCalledTimes(1);
    expect(httpPost).not.toHaveBeenCalled();
  });
});
