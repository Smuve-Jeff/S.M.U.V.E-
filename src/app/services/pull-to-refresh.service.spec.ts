import { TestBed } from '@angular/core/testing';
import { PullToRefreshService } from './pull-to-refresh.service';

describe('PullToRefreshService', () => {
  let service: PullToRefreshService;
  let element: HTMLElement;

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  /**
   * jsdom ships no TouchEvent constructor, so dispatch a real event and hang a
   * `touches` list off it. Dispatching on the element gives it the target the
   * handler reads `scrollTop` from.
   */
  const dispatchTouch = (type: string, clientY: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', {
      value: [{ clientY }],
      configurable: true,
    });
    element.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PullToRefreshService);
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  it('refreshes once the pull passes the threshold', async () => {
    const onRefresh = jest.fn(() => Promise.resolve());
    service.attach(element, { onRefresh });

    dispatchTouch('touchstart', 0);
    dispatchTouch('touchmove', 200);

    // 200px of travel through the 0.5 resistance curve, under maxPull.
    expect(service.pullDistance()).toBe(100);

    dispatchTouch('touchend', 200);
    await flush();

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(service.isRefreshing()).toBe(false);
    expect(service.pullDistance()).toBe(0);
  });

  it('abandons a pull that never reaches the threshold', async () => {
    const onRefresh = jest.fn(() => Promise.resolve());
    service.attach(element, { onRefresh });

    dispatchTouch('touchstart', 0);
    dispatchTouch('touchmove', 60); // 30px after resistance, under the 60 default
    dispatchTouch('touchend', 60);
    await flush();

    expect(onRefresh).not.toHaveBeenCalled();
    expect(service.pullDistance()).toBe(0);
  });

  it('caps the pull distance at maxPull', () => {
    service.attach(element, { onRefresh: () => Promise.resolve(), maxPull: 80 });

    dispatchTouch('touchstart', 0);
    dispatchTouch('touchmove', 1000);

    expect(service.pullDistance()).toBe(80);
  });

  it('ignores the gesture while the surface is scrolled down', () => {
    service.attach(element, { onRefresh: () => Promise.resolve() });
    Object.defineProperty(element, 'scrollTop', {
      value: 120,
      configurable: true,
    });

    dispatchTouch('touchstart', 0);
    dispatchTouch('touchmove', 400);

    expect(service.pullDistance()).toBe(0);
  });

  /*
   * The regression: `this.onTouchStart.bind(this)` produced a new function per
   * call, so teardown removed references the browser had never seen and every
   * attach/detach cycle left a live listener behind.
   */
  it('attaches and removes the exact same handler references', () => {
    const addSpy = jest.spyOn(element, 'addEventListener');
    const removeSpy = jest.spyOn(element, 'removeEventListener');

    const detach = service.attach(element, {
      onRefresh: () => Promise.resolve(),
    });
    const attached = addSpy.mock.calls.map((call) => call[1]);
    expect(attached).toHaveLength(4);

    detach();

    const removed = removeSpy.mock.calls.map((call) => call[1]);
    attached.forEach((handler) => expect(removed).toContain(handler));
  });

  it('stops tracking gestures once detached', () => {
    const detach = service.attach(element, {
      onRefresh: () => Promise.resolve(),
    });
    detach();

    dispatchTouch('touchstart', 0);
    dispatchTouch('touchmove', 400);

    expect(service.pullDistance()).toBe(0);
  });

  it('clears a half-finished pull on detach', () => {
    const detach = service.attach(element, {
      onRefresh: () => Promise.resolve(),
    });

    dispatchTouch('touchstart', 0);
    dispatchTouch('touchmove', 200);
    expect(service.pullDistance()).toBe(100);

    detach();

    expect(service.pullDistance()).toBe(0);
  });

  /* Android hands the gesture to the browser: without touchcancel the pull hung. */
  it('resets on touchcancel and does not refresh the cancelled gesture', async () => {
    const onRefresh = jest.fn(() => Promise.resolve());
    service.attach(element, { onRefresh });

    dispatchTouch('touchstart', 0);
    dispatchTouch('touchmove', 200);
    expect(service.pullDistance()).toBe(100);

    dispatchTouch('touchcancel', 200);
    expect(service.pullDistance()).toBe(0);

    dispatchTouch('touchend', 200);
    await flush();

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
