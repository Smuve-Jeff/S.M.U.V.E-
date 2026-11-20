import { CgiRendererService } from './cgi-renderer.service';
import { createDefaultCgiScene } from './cgi-scene';

describe('CgiRendererService', () => {
  it('returns null instead of a blank frame when WebGL is unavailable', () => {
    const service = new CgiRendererService();

    expect(service.render(createDefaultCgiScene(), 640, 360, 0, 10)).toBeNull();

    service.dispose();
  });

  it('reports a missing WebGL as a failed stage instead of silence', () => {
    const service = new CgiRendererService();
    expect(service.status()).toBe('idle');

    expect(service.render(createDefaultCgiScene(), 640, 360, 0, 10)).toBeNull();

    expect(service.status()).toBe('failed');
    expect(service.statusDetail()).toContain('WebGL');
    service.dispose();
    expect(service.status()).toBe('idle');
    expect(service.statusDetail()).toBe('');
  });

  it('skips a disabled scene and tiny targets without touching WebGL', () => {
    const service = new CgiRendererService();
    const scene = createDefaultCgiScene();

    expect(service.render({ ...scene, enabled: false }, 640, 360, 0, 10)).toBeNull();
    expect(service.render(scene, 1, 1, 0, 10)).toBeNull();

    service.dispose();
  });

  it('contains a render failure and schedules a rebuild instead of throwing', () => {
    const service = new CgiRendererService();
    const internals = service as unknown as {
      renderer: unknown;
      scene: unknown;
      camera: unknown;
      objectRoot: unknown;
      retryAt: number;
    };
    internals.renderer = {
      domElement: document.createElement('canvas'),
      shadowMap: {},
      setSize: () => undefined,
      setClearColor: () => undefined,
      render: () => {
        throw new Error('context lost');
      },
      dispose: () => undefined,
      forceContextLoss: () => undefined,
    };
    internals.scene = {
      environment: null,
      environmentIntensity: 1,
      clear: () => undefined,
    };
    internals.camera = {
      fov: 42,
      aspect: 1,
      position: { set: () => undefined },
      lookAt: () => undefined,
      updateProjectionMatrix: () => undefined,
    };
    internals.objectRoot = { children: [], clear: () => undefined };
    const scene = {
      ...createDefaultCgiScene(),
      objects: [],
      reflections: false,
    };

    expect(service.render(scene, 640, 360, 0, 10)).toBeNull();
    expect(internals.renderer).toBeNull();
    expect(internals.retryAt).toBeGreaterThan(0);
    // A failed draw is a visible surface failure, not a quiet empty frame.
    expect(service.status()).toBe('failed');
    expect(service.statusDetail()).toContain('drawing');
    // Inside the retry window the next frame is a no-op, not a second throw.
    expect(service.render(scene, 640, 360, 0, 10)).toBeNull();

    service.dispose();
  });

  it('rebuilds immediately when the host retries a failed surface', () => {
    const service = new CgiRendererService();
    const internals = service as unknown as {
      retryAt: number;
      surfaceFailures: number;
    };
    service.status.set('failed');
    service.statusDetail.set('The GPU could not create the 3D stage.');
    internals.retryAt = Date.now() + 30_000;
    internals.surfaceFailures = 3;

    service.retrySurface();

    expect(service.status()).toBe('idle');
    expect(service.statusDetail()).toBe('');
    expect(internals.retryAt).toBe(0);
    expect(internals.surfaceFailures).toBe(0);

    service.dispose();
  });

  it('keeps a no-WebGL failure after a retry', () => {
    const service = new CgiRendererService();
    expect(service.render(createDefaultCgiScene(), 640, 360, 0, 10)).toBeNull();

    service.retrySurface();

    expect(service.status()).toBe('failed');
    expect(service.statusDetail()).toContain('WebGL');

    service.dispose();
  });

  it('can be disposed more than once', () => {
    const service = new CgiRendererService();

    expect(() => {
      service.dispose();
      service.dispose();
    }).not.toThrow();
  });
});
