import {
  VERTEX_SHADER_2D,
  FRAGMENT_SHADER_2D,
  VERTEX_SHADER_LINE,
  FRAGMENT_SHADER_LINE,
} from './shaders';

/** 2D camera controlling pan offset and zoom level */
export interface Camera2D {
  /** Horizontal scroll offset in world units */
  scrollX: number;
  /** Vertical scroll offset in world units */
  scrollY: number;
  /** Zoom multiplier (> 0). 1.0 = default. */
  zoom: number;
}

/** RGBA color with normalized 0–1 components */
export interface GLColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Maximum quads batched per frame before auto-flush */
const MAX_QUADS = 16384;
const MAX_LINES = 16384;
const FLOATS_PER_QUAD_VERT = 9; // pos(2) + color(4) + texcoord(2) + radius(1) = 9
const FLOATS_PER_LINE_VERT = 6; // pos(2) + color(4)

// ---- Helpers ----

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile error: ' + log);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  frag: WebGLShader
): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('Program link error: ' + log);
  }
  return program;
}

function orthoMatrix(
  left: number,
  right: number,
  bottom: number,
  top: number
): Float32Array {
  return new Float32Array([
    2 / (right - left),
    0,
    0,
    0,
    0,
    2 / (top - bottom),
    0,
    0,
    0,
    0,
    -1,
    0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    0,
    1,
  ]);
}

function cameraMatrix(cam: Camera2D): Float32Array {
  const z = cam.zoom;
  return new Float32Array([
    z,
    0,
    0,
    0,
    0,
    z,
    0,
    0,
    0,
    0,
    1,
    0,
    -cam.scrollX * z,
    -cam.scrollY * z,
    0,
    1,
  ]);
}

// ---- Quad Batcher ----

interface QuadVertex {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
  u: number;
  v: number;
  borderRadius: number;
  borderWidth: number;
}

// ---- Main Renderer ----

export class WebGLRenderer {
  private gl!: WebGL2RenderingContext;
  private canvas!: HTMLCanvasElement;

  private quadProgram!: WebGLProgram;
  private lineProgram!: WebGLProgram;

  // Quad geometry
  private quadVao!: WebGLVertexArrayObject;
  private quadVbo!: WebGLBuffer;
  private quadData!: Float32Array;
  private quadCount = 0;

  // Line geometry
  private lineVao!: WebGLVertexArrayObject;
  private lineVbo!: WebGLBuffer;
  private lineData!: Float32Array;
  private lineCount = 0;

  // Uniforms
  private uQuadProjection!: WebGLUniformLocation;
  private uQuadCamera!: WebGLUniformLocation;
  private uLineProjection!: WebGLUniformLocation;
  private uLineCamera!: WebGLUniformLocation;

  private projection!: Float32Array;
  private currentCamera: Camera2D = { scrollX: 0, scrollY: 0, zoom: 1 };
  private frameBegun = false;

  /** RGBA pixel readback buffer for hit-testing */
  private hitBuffer: Uint8Array | null = null;

  private animationId: number | null = null;
  private renderCallback: (() => void) | null = null;
  private dirty = true;

  // ---- Lifecycle ----

  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    // Compile programs
    this.quadProgram = linkProgram(
      gl,
      compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_2D),
      compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_2D)
    );
    this.lineProgram = linkProgram(
      gl,
      compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_LINE),
      compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_LINE)
    );

    // Uniforms
    this.uQuadProjection = gl.getUniformLocation(this.quadProgram, 'uProjection')!;
    this.uQuadCamera = gl.getUniformLocation(this.quadProgram, 'uCamera')!;
    this.uLineProjection = gl.getUniformLocation(this.lineProgram, 'uProjection')!;
    this.uLineCamera = gl.getUniformLocation(this.lineProgram, 'uCamera')!;

    // Quad VAO
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    this.quadData = new Float32Array(MAX_QUADS * 6 * FLOATS_PER_QUAD_VERT);
    gl.bufferData(gl.ARRAY_BUFFER, this.quadData.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_QUAD_VERT * 4;
    // aPosition
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    // aColor
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 8);
    // aTexCoord
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
    // aBorderRadius
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 32);

    // Line VAO
    this.lineVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lineVao);
    this.lineVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    this.lineData = new Float32Array(MAX_LINES * 2 * FLOATS_PER_LINE_VERT);
    gl.bufferData(gl.ARRAY_BUFFER, this.lineData.byteLength, gl.DYNAMIC_DRAW);

    const lStride = FLOATS_PER_LINE_VERT * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, lStride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, lStride, 8);

    gl.bindVertexArray(null);
    this.resize();
  }

  resize(): void {
    const gl = this.gl;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      gl.viewport(0, 0, w * dpr, h * dpr);
    }
    // Projection: pixel coords (0..w, 0..h) → clip space (-1..1, flipped Y)
    this.projection = orthoMatrix(0, w, h, 0);
    this.dirty = true;
  }

  destroy(): void {
    this.stopAnimationLoop();
    const gl = this.gl;
    if (gl) {
      gl.deleteProgram(this.quadProgram);
      gl.deleteProgram(this.lineProgram);
      gl.deleteBuffer(this.quadVbo);
      gl.deleteBuffer(this.lineVbo);
      gl.deleteVertexArray(this.quadVao);
      gl.deleteVertexArray(this.lineVao);
    }
  }

  // ---- Animation Loop ----

  /** Start continuous rendering (e.g., during playback) */
  startAnimationLoop(callback: () => void): void {
    if (this.animationId !== null) return;
    this.renderCallback = callback;
    const tick = () => {
      this.animationId = requestAnimationFrame(tick);
      callback();
    };
    this.animationId = requestAnimationFrame(tick);
  }

  stopAnimationLoop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.renderCallback = null;
  }

  markDirty(): void {
    this.dirty = true;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  // ---- Frame Management ----

  beginFrame(camera: Camera2D): void {
    if (this.frameBegun) this.flush();
    this.frameBegun = true;
    this.currentCamera = {
      scrollX: Math.max(0, camera.scrollX),
      scrollY: Math.max(0, camera.scrollY),
      zoom: Math.max(0.1, Math.min(10, camera.zoom)),
    };
    this.quadCount = 0;
    this.lineCount = 0;
    this.dirty = false;
  }

  flush(): void {
    if (!this.frameBegun) return;
    this.frameBegun = false;

    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const camM = cameraMatrix(this.currentCamera);

    // Draw quads
    if (this.quadCount > 0) {
      gl.useProgram(this.quadProgram);
      gl.uniformMatrix4fv(this.uQuadProjection, false, this.projection);
      gl.uniformMatrix4fv(this.uQuadCamera, false, camM);
      gl.bindVertexArray(this.quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        this.quadData.subarray(0, this.quadCount * 6 * FLOATS_PER_QUAD_VERT)
      );
      gl.drawArrays(gl.TRIANGLES, 0, this.quadCount * 6);
    }

    // Draw lines
    if (this.lineCount > 0) {
      gl.useProgram(this.lineProgram);
      gl.uniformMatrix4fv(this.uLineProjection, false, this.projection);
      gl.uniformMatrix4fv(this.uLineCamera, false, camM);
      gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        this.lineData.subarray(0, this.lineCount * 2 * FLOATS_PER_LINE_VERT)
      );
      gl.drawArrays(gl.LINES, 0, this.lineCount * 2);
    }

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  clear(r = 0.02, g = 0.04, b = 0.09, a = 1.0): void {
    const gl = this.gl;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // ---- Drawing Primitives ----

  /** Draw a filled rounded rectangle in world coordinates */
  drawQuad(
    x: number,
    y: number,
    width: number,
    height: number,
    color: GLColor,
    borderRadius = 0,
    borderWidth = 0
  ): void {
    if (this.quadCount >= MAX_QUADS) this.flushAndRestart();

    const idx = this.quadCount * 6 * FLOATS_PER_QUAD_VERT;
    const { r, g, b, a } = color;
    const x2 = x + width;
    const y2 = y + height;
    const br = Math.min(borderRadius, Math.min(width, height) / 2);

    // 6 vertices per quad (2 triangles), each with 9 floats
    // Triangle 1: top-left, top-right, bottom-right
    // Triangle 2: top-left, bottom-right, bottom-left
    const verts = [
      x, y, r, g, b, a, 0, 0, br, // TL
      x2, y, r, g, b, a, 1, 0, br, // TR
      x2, y2, r, g, b, a, 1, 1, br, // BR
      x, y, r, g, b, a, 0, 0, br, // TL
      x2, y2, r, g, b, a, 1, 1, br, // BR
      x, y2, r, g, b, a, 0, 1, br, // BL
    ];

    this.quadData.set(verts, idx);
    this.quadCount++;
  }

  /** Draw a line between two world-space points */
  drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: GLColor
  ): void {
    if (this.lineCount >= MAX_LINES) this.flushAndRestart();

    const idx = this.lineCount * 2 * FLOATS_PER_LINE_VERT;
    const { r, g, b, a } = color;
    this.lineData.set(
      [x1, y1, r, g, b, a, x2, y2, r, g, b, a],
      idx
    );
    this.lineCount++;
  }

  /** Draw a vertical line (optimized) */
  drawVLine(x: number, y1: number, y2: number, color: GLColor): void {
    this.drawLine(x, y1, x, y2, color);
  }

  /** Draw a horizontal line (optimized) */
  drawHLine(y: number, x1: number, x2: number, color: GLColor): void {
    this.drawLine(x1, y, x2, y, color);
  }

  // ---- Coordinate Transforms ----

  /** Convert screen pixel coordinates to world coordinates */
  screenToWorld(
    screenX: number,
    screenY: number,
    canvasRect: DOMRect
  ): { x: number; y: number } {
    const cam = this.currentCamera;
    return {
      x: (screenX - canvasRect.left) / cam.zoom + cam.scrollX,
      y: (screenY - canvasRect.top) / cam.zoom + cam.scrollY,
    };
  }

  /** Convert world coordinates to screen pixel coordinates */
  worldToScreen(
    worldX: number,
    worldY: number,
    canvasRect: DOMRect
  ): { x: number; y: number } {
    const cam = this.currentCamera;
    return {
      x: (worldX - cam.scrollX) * cam.zoom + canvasRect.left,
      y: (worldY - cam.scrollY) * cam.zoom + canvasRect.top,
    };
  }

  // ---- Internal ----

  private flushAndRestart(): void {
    const cam = { ...this.currentCamera };
    this.flush();
    this.frameBegun = true;
    this.currentCamera = cam;
    this.quadCount = 0;
    this.lineCount = 0;
  }

  /** Current world-space visible bounds */
  get visibleBounds(): {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const cam = this.currentCamera;
    return {
      left: cam.scrollX,
      right: cam.scrollX + w / cam.zoom,
      top: cam.scrollY,
      bottom: cam.scrollY + h / cam.zoom,
    };
  }
}
