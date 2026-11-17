import { CgiRendererService } from './cgi-renderer.service';
import { createDefaultCgiScene } from './cgi-scene';

describe('CgiRendererService', () => {
  it('returns null instead of a blank frame when WebGL is unavailable', () => {
    const service = new CgiRendererService();

    expect(service.render(createDefaultCgiScene(), 640, 360, 0, 10)).toBeNull();

    service.dispose();
  });

  it('skips a disabled scene and tiny targets without touching WebGL', () => {
    const service = new CgiRendererService();
    const scene = createDefaultCgiScene();

    expect(service.render({ ...scene, enabled: false }, 640, 360, 0, 10)).toBeNull();
    expect(service.render(scene, 1, 1, 0, 10)).toBeNull();

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
