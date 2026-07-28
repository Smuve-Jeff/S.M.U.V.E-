import { AudioEngineService } from './audio-engine.service';

// Minimal bare-instance helper: skips the heavy constructor (which needs a
// full AudioContext mock) and only seeds the state required to exercise
// setSendLevel. Avoids the brittleness of mocking dozens of createGain /
// createBiquadFilter nodes.
function makeBareEngine() {
  const svc = Object.create(AudioEngineService.prototype) as AudioEngineService;
  (svc as any).trackSendAGains = new Map();
  (svc as any).trackSendBGains = new Map();
  (svc as any).ctx = { currentTime: 1.234 };
  return svc;
}

function gain(map: Map<string, any>, id: string) {
  if (!map.has(id)) {
    map.set(id, { gain: { setTargetAtTime: jest.fn(), value: 0 } });
  }
  return map.get(id)!;
}

describe('AudioEngineService.setSendLevel', () => {
  let svc: AudioEngineService;

  beforeEach(() => {
    svc = makeBareEngine();
    // Pre-populate with one track of each
    gain((svc as any).trackSendAGains, 't1');
    gain((svc as any).trackSendBGains, 't1');
    gain((svc as any).trackSendAGains, 't2');
  });

  it('clamps negative level to 0 (sendA)', () => {
    (svc as any).setSendLevel('t1', 'A', -5);
    const node = (svc as any).trackSendAGains.get('t1');
    expect(node.gain.setTargetAtTime).toHaveBeenCalledWith(
      0,
      expect.any(Number),
      0.05
    );
  });

  it('clamps level above 1.5 down to 1.5 (sendB)', () => {
    (svc as any).setSendLevel('t1', 'B', 99);
    const node = (svc as any).trackSendBGains.get('t1');
    expect(node.gain.setTargetAtTime).toHaveBeenCalledWith(
      1.5,
      expect.any(Number),
      0.05
    );
  });

  it("sendId 'A' routes to trackSendAGains, not trackSendBGains", () => {
    (svc as any).setSendLevel('t2', 'A', 0.6);
    expect(
      (svc as any).trackSendAGains.get('t2').gain.setTargetAtTime
    ).toHaveBeenCalledWith(0.6, 1.234, 0.05);
    expect(
      (svc as any).trackSendBGains.get('t2')?.gain.setTargetAtTime
    ).toBeUndefined();
    // Track t3 not present in B, should not throw + should not call.
  });

  it("sendId 'B' routes to trackSendBGains, not trackSendAGains", () => {
    (svc as any).setSendLevel('t1', 'B', 0.42);
    expect(
      (svc as any).trackSendBGains.get('t1').gain.setTargetAtTime
    ).toHaveBeenCalledWith(0.42, 1.234, 0.05);
  });

  it('no-op (no throw) when trackId is not in the send map', () => {
    expect(() => (svc as any).setSendLevel('does-not-exist', 'A', 0.5)).not.toThrow();
    expect(() => (svc as any).setSendLevel('does-not-exist', 'B', 0.5)).not.toThrow();
  });

  it('invalid sendId returns without mutating either map', () => {
    (svc as any).setSendLevel('t1', 'C' as any, 0.5);
    expect(
      (svc as any).trackSendAGains.get('t1').gain.setTargetAtTime
    ).not.toHaveBeenCalled();
    expect(
      (svc as any).trackSendBGains.get('t1').gain.setTargetAtTime
    ).not.toHaveBeenCalled();
  });

  it('uses the current AudioContext time as the ramp anchor', () => {
    (svc as any).ctx.currentTime = 9.876;
    (svc as any).setSendLevel('t1', 'A', 0.3);
    expect(
      (svc as any).trackSendAGains.get('t1').gain.setTargetAtTime
    ).toHaveBeenCalledWith(0.3, 9.876, 0.05);
  });
});
