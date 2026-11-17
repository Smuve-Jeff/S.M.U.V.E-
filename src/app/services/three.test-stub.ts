/**
 * Jest-only stand-in for Three.js.
 *
 * Three 0.187 ships ESM only, while this repo's Jest preset runs CommonJS and
 * cannot parse `three.module.js`. Tests never have a WebGL context, so they
 * only need the constructor to fail and exercise the renderer's fallback. The
 * Angular build resolves the real package.
 */
export class WebGLRenderer {
  constructor() {
    throw new Error('WebGL is unavailable in Jest');
  }
}
