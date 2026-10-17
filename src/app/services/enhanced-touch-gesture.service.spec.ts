import { EnhancedTouchGestureService } from './enhanced-touch-gesture.service';

/**
 * `handlePinch` only zeroes its reference span when it is handed a frame with
 * fewer than two touches. Lifting both fingers never produced such a frame, so
 * the previous gesture's distance stayed in place and the next pinch jumped on
 * its first frame. These specs pin the explicit reset the grid handlers call.
 */
describe('EnhancedTouchGestureService.resetPinch', () => {
  const point = (x: number, y: number) => ({ clientX: x, clientY: y });

  /** A synthetic two-finger frame with the given horizontal span. */
  const pinchFrame = (span: number) =>
    ({
      touches: [point(100, 100), point(100 + span, 100)],
      preventDefault: jest.fn(),
    }) as unknown as TouchEvent;

  const singleFrame = () =>
    ({ touches: [point(10, 10)] }) as unknown as TouchEvent;

  const makeService = () => {
    const svc = new EnhancedTouchGestureService();
    // `handleTouchStart` is what seeds this in production; mirror it so
    // pinchState maths stays finite.
    (svc as unknown as { twoFingerStartDistance: number }).twoFingerStartDistance =
      100;
    return svc;
  };

  it('zooms on the second frame of a pinch, using the first as the baseline', () => {
    const svc = makeService();

    svc.handlePinch(pinchFrame(100)); // baseline only
    expect(svc.zoomLevel()).toBe(1);

    svc.handlePinch(pinchFrame(50)); // half the span → zoom out
    expect(svc.zoomLevel()).toBeLessThan(1);
  });

  it('measures the next pinch from scratch once resetPinch is called', () => {
    const svc = makeService();

    svc.handlePinch(pinchFrame(100));
    svc.handlePinch(pinchFrame(50));

    // Fingers lifted: both grid handlers now call this.
    svc.resetPinch();
    const zoomAfterReset = svc.zoomLevel();

    svc.handlePinch(pinchFrame(300)); // first frame of the new gesture
    expect(svc.zoomLevel()).toBe(zoomAfterReset);
  });

  it('without the reset the stale span would still drive the first frame', () => {
    const svc = makeService();

    svc.handlePinch(pinchFrame(100));
    // No reset — this is the pre-fix behaviour, kept as a guard so the fix
    // cannot be silently removed later.
    const zoomBefore = svc.zoomLevel();
    svc.handlePinch(pinchFrame(300));
    expect(svc.zoomLevel()).not.toBe(zoomBefore);
  });

  it('still zeroes the span automatically on a non-two-finger frame', () => {
    const svc = makeService();

    svc.handlePinch(pinchFrame(100));
    svc.handlePinch(singleFrame());
    const zoom = svc.zoomLevel();

    svc.handlePinch(pinchFrame(300));
    expect(svc.zoomLevel()).toBe(zoom);
  });
});
