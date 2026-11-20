import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { createTestPattern } from './test-pattern';
import {
  BroadcastIngestService,
  BroadcastRecordingDto,
} from './broadcast-ingest.service';
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
const httpPut = jest.fn();
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
  httpPut.mockReset();
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
          put: httpPut,
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

describe('BroadcastIngestService custom RTMP destination', () => {
  it('saves the label and shows it in the destination picker', async () => {
    httpPut.mockReturnValueOnce(
      of({
        platform: 'custom',
        ready: true,
        detail: 'TikTok — ingest.example.com',
        label: 'TikTok',
      }),
    );
    const service = TestBed.inject(BroadcastIngestService);

    expect(
      await service.saveDestination(
        'custom',
        'rtmps://ingest.example.com/live',
        'TIKTOK_KEY_123',
        'TikTok',
      ),
    ).toBe(true);

    expect(httpPut).toHaveBeenCalledWith(
      expect.stringContaining('/destinations/custom'),
      {
        rtmpUrl: 'rtmps://ingest.example.com/live',
        streamKey: 'TIKTOK_KEY_123',
        label: 'TikTok',
      },
      expect.anything(),
    );
    expect(service.ready('custom')).toBe(true);
    expect(service.platformLabel('custom')).toBe('TikTok');
  });

  it('keeps four custom slots available at the same time', async () => {
    const slots = [
      ['custom', 'TikTok'],
      ['custom2', 'Instagram'],
      ['custom3', 'X'],
      ['custom4', 'LinkedIn'],
    ] as const;
    httpPut.mockImplementation((url: string) => {
      const slot = slots.find(([value]) => url.endsWith(`/${value}`));
      return of({
        platform: slot?.[0],
        ready: true,
        detail: `${slot?.[1]} — ingest.example.com`,
        label: slot?.[1],
      });
    });
    const service = TestBed.inject(BroadcastIngestService);

    for (const [slot, label] of slots) {
      expect(
        await service.saveDestination(
          slot,
          `rtmps://${label.toLowerCase()}.example.com/live`,
          `${label.toUpperCase()}_KEY_123`,
          label,
        ),
      ).toBe(true);
    }

    expect(slots.map(([slot]) => service.platformLabel(slot))).toEqual([
      'TikTok',
      'Instagram',
      'X',
      'LinkedIn',
    ]);
    expect(slots.every(([slot]) => service.ready(slot))).toBe(true);
  });

  it('clears a saved custom slot and falls back to its numbered label', async () => {
    httpPut.mockReturnValueOnce(
      of({
        platform: 'custom2',
        ready: true,
        detail: 'Instagram — ingest.example.com',
        label: 'Instagram',
      }),
    );
    httpDelete.mockReturnValueOnce(of(null));
    const service = TestBed.inject(BroadcastIngestService);

    expect(
      await service.saveDestination(
        'custom2',
        'rtmps://instagram.example.com/live',
        'INSTAGRAM_KEY_123',
        'Instagram',
      ),
    ).toBe(true);
    expect(service.platformLabel('custom2')).toBe('Instagram');

    expect(await service.clearDestination('custom2')).toBe(true);

    expect(httpDelete).toHaveBeenCalledWith(
      expect.stringContaining('/destinations/custom2'),
      expect.anything(),
    );
    expect(service.ready('custom2')).toBe(false);
    expect(service.platformLabel('custom2')).toBe('CUSTOM 2');
  });
});

describe('BroadcastIngestService manual destinations', () => {
  it('clears a saved Kick destination, key included', async () => {
    const service = TestBed.inject(BroadcastIngestService);
    service.destinations.set({
      kick: { platform: 'kick', ready: true, detail: 'KICK — rtmp.kick.com' },
    });
    httpDelete.mockReturnValue(of(undefined));

    await expect(service.clearDestination('kick')).resolves.toBe(true);

    expect(httpDelete).toHaveBeenCalledWith(
      expect.stringContaining('/broadcast/destinations/kick'),
      expect.anything(),
    );
    expect(service.destinations().kick).toBeUndefined();
  });
});

describe('BroadcastIngestService destination test', () => {
  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };

  it('passes when the provider accepts egress media and cleans up', async () => {
    jest.useFakeTimers();
    try {
      const service = TestBed.inject(BroadcastIngestService);
      // Let the signed-out profile effect settle before seeding the destination.
      TestBed.tick();
      await flush();
      service.destinations.set({
        custom: { platform: 'custom', ready: true, label: 'TikTok' },
      });
      httpPost.mockReturnValueOnce(
        of({ relayId: 'test-1', whipUrl: 'https://relay.test/whip' }),
      );
      httpPost.mockReturnValueOnce(
        of({
          platform: 'custom',
          ready: true,
          label: 'TikTok',
          verification: 'verified',
          verifiedAt: new Date().toISOString(),
        }),
      );
      httpGet.mockReturnValueOnce(
        of({
          running: true,
          bytesOut: 2048,
          bitrateKbps: 700,
          stalled: false,
          error: null,
        }),
      );
      httpDelete.mockReturnValue(of(undefined));

      const pending = service.testDestination('custom');
      await flush();
      jest.advanceTimersByTime(6_000);
      await flush();

      await expect(pending).resolves.toBe(true);
      expect(httpPost).toHaveBeenCalledWith(
        expect.stringContaining('/ingest'),
        { platforms: ['custom'], ephemeral: true },
        expect.anything(),
      );
      expect(httpPost).toHaveBeenCalledWith(
        expect.stringContaining('/destinations/custom/verify'),
        { relayId: 'test-1' },
        expect.anything(),
      );
      expect(service.verified('custom')).toBe(true);
      expect(service.destinationTest('custom').status).toBe('pass');
      expect(service.testingDestination()).toBeNull();
      expect(whipStop).toHaveBeenCalled();
      expect(testPattern.stop).toHaveBeenCalled();
      expect(httpDelete).toHaveBeenCalledWith(
        expect.stringContaining('/ingest/test-1'),
        expect.anything(),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails when the provider receives no media', async () => {
    jest.useFakeTimers();
    try {
      const service = TestBed.inject(BroadcastIngestService);
      TestBed.tick();
      await flush();
      service.destinations.set({
        kick: { platform: 'kick', ready: true, label: 'KICK' },
      });
      httpPost.mockReturnValueOnce(
        of({ relayId: 'test-2', whipUrl: 'https://relay.test/whip' }),
      );
      httpGet.mockReturnValueOnce(
        of({
          running: true,
          bytesOut: 0,
          bitrateKbps: 0,
          stalled: false,
          error: null,
        }),
      );
      httpDelete.mockReturnValue(of(undefined));

      const pending = service.testDestination('kick');
      await flush();
      jest.advanceTimersByTime(6_000);
      await flush();

      await expect(pending).resolves.toBe(false);
      expect(service.destinationTest('kick')).toMatchObject({
        status: 'fail',
        detail: expect.stringContaining('NO MEDIA'),
      });
      expect(service.testingDestination()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails when the destination closes the published connection', async () => {
    jest.useFakeTimers();
    try {
      const service = TestBed.inject(BroadcastIngestService);
      TestBed.tick();
      await flush();
      service.destinations.set({
        facebook: { platform: 'facebook', ready: true, label: 'FACEBOOK' },
      });
      httpPost.mockReturnValueOnce(
        of({ relayId: 'test-3', whipUrl: 'https://relay.test/whip' }),
      );
      httpGet.mockReturnValueOnce(
        of({
          running: false,
          bytesOut: 4096,
          bitrateKbps: 0,
          stalled: false,
          error: null,
        }),
      );
      httpDelete.mockReturnValue(of(undefined));

      const pending = service.testDestination('facebook');
      await flush();
      jest.advanceTimersByTime(6_000);
      await flush();

      await expect(pending).resolves.toBe(false);
      expect(service.destinationTest('facebook')).toMatchObject({
        status: 'fail',
        detail: expect.stringContaining('CLOSED THE CONNECTION'),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses to test a destination that is not saved', async () => {
    const service = TestBed.inject(BroadcastIngestService);

    await expect(service.testDestination('custom2')).resolves.toBe(false);

    expect(httpPost).not.toHaveBeenCalled();
    expect(whipStart).not.toHaveBeenCalled();
  });
});

describe('BroadcastIngestService push status', () => {
  it('lists every reason a push is blocked on one line', () => {
    const service = TestBed.inject(BroadcastIngestService);
    service.relayConfigured.set(null);
    service.checkError.set(null);
    service.destinations.set({});

    expect(service.pushStatus()).toBe(
      'PUSH BLOCKED — RELAY NOT CHECKED · NO DESTINATION READY',
    );

    service.destinations.set({
      twitch: { platform: 'twitch', ready: true, detail: 'TWITCH — host' },
    });
    service.relayConfigured.set(true);

    expect(service.pushBlockers()).toEqual([]);
    expect(service.pushStatus()).toBe('PUSH READY — 1 DESTINATION');

    service.checkError.set(
      'RELAY CHECK FAILED — CHECK YOUR CONNECTION AND SIGN-IN',
    );

    expect(service.pushStatus()).toContain('CHECK FAILED');
  });

  it('explains each disabled PUSH with the same blocker reasons', () => {
    const service = TestBed.inject(BroadcastIngestService);
    service.relayConfigured.set(true);
    service.checkError.set(null);
    service.destinations.set({});

    expect(service.pushDisabledReason('twitch')).toBe(
      'PUSH BLOCKED — NO DESTINATION READY · CONNECT TWITCH IN SETTINGS → STREAMING',
    );
    expect(service.pushDisabledReason('kick')).toContain(
      'CONNECT KICK OR SAVE ITS RTMP URL + KEY',
    );
    expect(service.pushDisabledReason('facebook')).toContain(
      'LINK A FACEBOOK PAGE OR SAVE ITS RTMP URL + KEY',
    );
    expect(service.pushDisabledReason('custom')).toContain(
      "SAVE THIS CUSTOM DESTINATION'S RTMP URL + KEY",
    );

    service.destinations.set({
      twitch: { platform: 'twitch', ready: true, detail: 'TWITCH — host' },
    });
    expect(service.pushDisabledReason('twitch')).toBe('');

    service.relayConfigured.set(false);
    expect(service.pushDisabledReason('twitch')).toBe(
      'PUSH BLOCKED — RELAY NOT CONFIGURED',
    );
  });

  it('keeps the inline hint row-specific while the tooltip stays complete', () => {
    const service = TestBed.inject(BroadcastIngestService);
    service.checkError.set(null);
    service.relayConfigured.set(true);
    service.destinations.set({});

    expect(service.pushDisabledHint('twitch')).toBe(
      'CONNECT TWITCH IN SETTINGS → STREAMING',
    );
    expect(service.pushDisabledHint('facebook')).toBe(
      'LINK A FACEBOOK PAGE OR SAVE ITS RTMP URL + KEY IN SETTINGS → STREAMING',
    );

    service.destinations.set({
      twitch: { platform: 'twitch', ready: true, detail: 'TWITCH — host' },
    });
    expect(service.pushDisabledHint('twitch')).toBe('');

    service.relayConfigured.set(false);
    expect(service.pushDisabledHint('twitch')).toBe('RELAY NOT CONFIGURED');
    expect(service.pushDisabledReason('twitch')).toBe(
      'PUSH BLOCKED — RELAY NOT CONFIGURED',
    );

    service.relayConfigured.set(true);
    service.pushing.set('twitch');
    expect(service.pushDisabledHint('twitch')).toBe('');
    expect(service.pushDisabledHint('kick')).toBe(
      'CONNECT KICK OR SAVE ITS RTMP URL + KEY IN SETTINGS → STREAMING',
    );
  });
});

describe('BroadcastIngestService relay check', () => {
  it('does not call a non-destinations response a ready relay', async () => {
    httpGet.mockReturnValue(of({}));
    const service = TestBed.inject(BroadcastIngestService);

    await service.load();

    expect(service.relayConfigured()).toBeNull();
    expect(service.checkError()).toContain('DESTINATIONS LIST');
  });

  it('reads relay readiness only from what the server reports', async () => {
    httpGet.mockReturnValue(
      of({
        platforms: [{ platform: 'twitch', ready: true }],
        relayConfigured: true,
      }),
    );
    const service = TestBed.inject(BroadcastIngestService);

    await service.load();

    expect(service.relayConfigured()).toBe(true);
    expect(service.ready('twitch')).toBe(true);
    expect(service.checkError()).toBeNull();
  });

  it('reports a failed check without inventing a ready relay', async () => {
    httpGet.mockReturnValue(throwError(() => new Error('offline')));
    const service = TestBed.inject(BroadcastIngestService);

    await service.load();

    expect(service.relayConfigured()).toBeNull();
    expect(service.checkError()).toContain('CHECK YOUR CONNECTION');
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

describe('BroadcastIngestService segmented recordings', () => {
  const show: BroadcastRecordingDto = {
    relayId: 'aaaa',
    platform: 'twitch',
    startedAt: '2026-01-01T10:00:00.000Z',
    endedAt: '2026-01-01T12:00:00.000Z',
    name: 'aaaa-10.mp4',
    parts: [
      {
        name: 'aaaa-10.mp4',
        bytes: 100,
        recordedAt: '2026-01-01T10:00:00.000Z',
        downloadPath: '/broadcast/recordings/aaaa/download?name=aaaa-10.mp4',
        durationSeconds: 3600,
      },
      {
        name: 'aaaa-11.mp4',
        bytes: 150,
        recordedAt: '2026-01-01T11:00:00.000Z',
        downloadPath: '/broadcast/recordings/aaaa/download?name=aaaa-11.mp4',
        durationSeconds: 1800,
      },
    ],
    bytes: 250,
    recordedAt: '2026-01-01T11:00:00.000Z',
    downloadPath: '/broadcast/recordings/aaaa/download?name=aaaa-10.mp4',
    durationSeconds: 5400,
  };

  it('says the show is in segments, with the whole length and size', () => {
    const service = TestBed.inject(BroadcastIngestService);

    const label = service.recordingLabel(show);

    expect(label).toContain('2 PARTS');
    expect(label).toContain('1:30:00');
    expect(label).toContain('1 KB');
  });

  it('plays the next segment when the player reaches the end of one', async () => {
    httpPost
      .mockReturnValueOnce(of({ path: '/broadcast/recordings/aaaa/stream?sig=1' }))
      .mockReturnValueOnce(of({ path: '/broadcast/recordings/aaaa/stream?sig=2' }));
    const service = TestBed.inject(BroadcastIngestService);

    await service.playRecording(show);

    expect(service.playback()?.partIndex).toBe(0);
    expect(service.playback()?.partCount).toBe(2);
    expect(httpPost).toHaveBeenLastCalledWith(
      expect.stringContaining('name=aaaa-10.mp4'),
      {},
      expect.anything(),
    );

    await service.playNextRecordingPart();

    expect(httpPost).toHaveBeenLastCalledWith(
      expect.stringContaining('name=aaaa-11.mp4'),
      {},
      expect.anything(),
    );
    expect(service.playback()?.partIndex).toBe(1);
    expect(service.playback()?.url).toContain('sig=2');

    // Nothing follows the last segment: the player stays where it is.
    await service.playNextRecordingPart();
    expect(service.playback()?.partIndex).toBe(1);
    expect(httpPost).toHaveBeenCalledTimes(2);
  });

  it('downloads a multi-part show as one archive, not one download per hour', async () => {
    httpPost.mockReturnValueOnce(
      of({
        path: '/broadcast/recordings/aaaa/archive?name=%40archive&u=7&exp=1&sig=x',
      }),
    );
    const service = TestBed.inject(BroadcastIngestService);
    const downloaded: string[] = [];
    const hrefs: string[] = [];
    const createElement = document.createElement.bind(document);
    const spy = jest
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const element = createElement(tag);
        if (tag === 'a') {
          (element as HTMLAnchorElement).click = () => {
            downloaded.push((element as HTMLAnchorElement).download);
            hrefs.push((element as HTMLAnchorElement).href);
          };
        }
        return element;
      });

    try {
      await service.downloadRecording(show);
    } finally {
      spy.mockRestore();
    }

    expect(httpPost).toHaveBeenCalledWith(
      expect.stringContaining('/recordings/aaaa/archive'),
      {},
      expect.anything(),
    );
    expect(downloaded).toEqual(['aaaa.zip']);
    expect(hrefs[0]).toContain('/archive?');
    // The browser streams the archive to disk; nothing is fetched as a blob.
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('downloads a show under an hour directly', async () => {
    httpGet.mockReturnValueOnce(of(new Blob(['one file'])));
    const service = TestBed.inject(BroadcastIngestService);
    const downloaded: string[] = [];
    const createElement = document.createElement.bind(document);
    const spy = jest
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const element = createElement(tag);
        if (tag === 'a') {
          (element as HTMLAnchorElement).click = () => {
            downloaded.push((element as HTMLAnchorElement).download);
          };
        }
        return element;
      });
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => 'blob:recording') as typeof URL.createObjectURL;
    URL.revokeObjectURL = jest.fn() as typeof URL.revokeObjectURL;

    try {
      await service.downloadRecording({ ...show, parts: undefined });
    } finally {
      spy.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }

    expect(httpGet).toHaveBeenCalledWith(
      expect.stringContaining('name=aaaa-10.mp4'),
      expect.anything(),
    );
    expect(httpPost).not.toHaveBeenCalled();
    expect(downloaded).toEqual(['aaaa-10.mp4']);
  });
});
