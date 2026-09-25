import { TestBed } from '@angular/core/testing';
import { SmuveTvPlaybackService } from './smuve-tv-playback.service';
import { SmuveTvFeedsService } from './smuve-tv-feeds.service';
import { SmuveTvService } from './smuve-tv.service';

/**
 * The app-wide session that owns the one live video.
 *
 * These tests drive the DOM directly: the service exists precisely so the
 * element can be moved between two surfaces without a second decoder, so the
 * behaviour worth pinning is what ends up in which host.
 */
describe('SmuveTvPlaybackService', () => {
  let service: SmuveTvPlaybackService;
  let feeds: SmuveTvFeedsService;
  let video: HTMLVideoElement;
  let fallbackHost: HTMLElement;
  let moduleHost: HTMLElement;
  let channelId: string;
  let feedUrl: string;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SmuveTvPlaybackService);
    feeds = TestBed.inject(SmuveTvFeedsService);

    fallbackHost = document.createElement('div');
    moduleHost = document.createElement('div');
    document.body.appendChild(fallbackHost);
    document.body.appendChild(moduleHost);

    video = document.createElement('video');
    // jsdom implements neither HLS nor real playback; the native-HLS branch is
    // what the guide uses on Safari and is the only one reachable here.
    video.canPlayType = () => 'maybe';
    fallbackHost.appendChild(video);

    const station = TestBed.inject(SmuveTvService).channels.find(
      (channel) => !!feeds.feedForStation(channel.id)
    )!;
    channelId = station.id;
    feedUrl = feeds.feedForStation(station.id)!.url;
  });

  afterEach(() => {
    service.unregisterVideo(video);
    fallbackHost.remove();
    moduleHost.remove();
  });

  const load = (): Promise<void> =>
    service.loadFeed(feeds.feedForStation(channelId), channelId, true, false);

  it('moves the one video into the guide stage while the guide is open', async () => {
    service.registerVideo(video, fallbackHost);
    service.mountInModule(moduleHost);
    await load();

    expect(video.parentElement).toBe(moduleHost);
    expect(service.surface()).toBe('module');
    expect(service.hasPlayableSession()).toBe(true);
  });

  /*
   * A pop-out has to move the element, not copy it: a copy would carry a
   * second decoder and the original would keep playing audio nobody can hear.
   */
  it('moves the same element to the shell when the picture is popped out', async () => {
    service.registerVideo(video, fallbackHost);
    service.mountInModule(moduleHost);
    await load();

    await service.popOut();

    expect(video.parentElement).toBe(fallbackHost);
    expect(service.isPersistent()).toBe(true);
    // The session survives the move — this is the whole point of the feature.
    expect(service.hasPlayableSession()).toBe(true);
  });

  /*
   * The dock is display:none until the surface signal reaches change
   * detection. Asking for Picture-in-Picture before that paint is what made
   * the browser refuse and the viewer see nothing happen.
   */
  it('waits for a painted frame before asking the browser for PiP', async () => {
    let requestSeenAfterFrame = false;
    let frames = 0;
    const originalRaf = global.requestAnimationFrame;
    global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frames += 1;
      return originalRaf(() => callback(performance.now()));
    }) as typeof requestAnimationFrame;

    (video as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
    }).requestPictureInPicture = () => {
      requestSeenAfterFrame = frames >= 2;
      return Promise.reject(new Error('jsdom has no PiP'));
    };
    (service as unknown as { pipSupported: { set(value: boolean): void } })
      .pipSupported.set(true);

    try {
      service.registerVideo(video, fallbackHost);
      service.mountInModule(moduleHost);
      await load();

      await service.popOut();
    } finally {
      global.requestAnimationFrame = originalRaf;
    }

    expect(requestSeenAfterFrame).toBe(true);
    // A refused request falls back to the floating dock rather than lying.
    expect(service.surface()).toBe('floating');
  });

  it('brings the picture back inside the guide when it is docked', async () => {
    service.registerVideo(video, fallbackHost);
    service.mountInModule(moduleHost);
    await load();
    await service.popOut();

    await service.dock();

    expect(video.parentElement).toBe(moduleHost);
    expect(service.surface()).toBe('module');
    expect(service.isPersistent()).toBe(false);
  });

  it('releases the session when the guide is left without a pop-out', async () => {
    service.registerVideo(video, fallbackHost);
    service.mountInModule(moduleHost);
    await load();

    service.detachFromModule();

    expect(service.hasPlayableSession()).toBe(false);
    expect(video.parentElement).toBe(fallbackHost);
  });

  it('keeps the session alive across a route change after a pop-out', async () => {
    service.registerVideo(video, fallbackHost);
    service.mountInModule(moduleHost);
    await load();
    await service.popOut();

    service.detachFromModule();

    expect(service.hasPlayableSession()).toBe(true);
    expect(service.isPersistent()).toBe(true);
  });

  it('explains a failed feed instead of leaving a black rectangle', async () => {
    service.registerVideo(video, fallbackHost);
    service.mountInModule(moduleHost);
    await load();

    service.failFeed();

    expect(service.ready()).toBe(false);
    expect(service.error()).toContain(feeds.feedForStation(channelId)!.name);
  });

  it('drops the source entirely when the viewer closes TV', async () => {
    service.registerVideo(video, fallbackHost);
    service.mountInModule(moduleHost);
    await load();
    expect(video.src).toContain(feedUrl.slice(0, 24));

    await service.close();

    expect(service.hasPlayableSession()).toBe(false);
    expect(service.surface()).toBe('closed');
    expect(video.src).toBe('');
  });
});
