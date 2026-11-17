import { Injectable } from '@angular/core';

export type LiveCompositeCorner =
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface LiveCompositeLayout {
  corner: LiveCompositeCorner;
  /** Camera width as a fraction of the output width. */
  scale: number;
  /** Inset from the frame edge as a fraction of the shorter frame side. */
  margin: number;
  mirrorCamera: boolean;
}

export interface LiveCompositeOptions {
  width: number;
  height: number;
  fps: number;
  layout: LiveCompositeLayout;
}

export interface LiveCompositeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LiveCompositeSession {
  stream: MediaStream;
  updateLayout(layout: Partial<LiveCompositeLayout>): void;
  stop(): void;
}

export const DEFAULT_LIVE_COMPOSITE_LAYOUT: LiveCompositeLayout = {
  corner: 'bottom-right',
  scale: 0.28,
  margin: 0.04,
  mirrorCamera: true,
};

const DEFAULT_FRAME = { width: 1280, height: 720, fps: 30 };
const MIN_SCALE = 0.1;
const MAX_SCALE = 0.5;
const MIN_MARGIN = 0;
const MAX_MARGIN = 0.2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function sourceSize(source: CanvasImageSource): {
  width: number;
  height: number;
} {
  const candidate = source as {
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
  };
  return {
    width: Number(
      candidate.videoWidth || candidate.naturalWidth || candidate.width || 0,
    ),
    height: Number(
      candidate.videoHeight || candidate.naturalHeight || candidate.height || 0,
    ),
  };
}

/** The camera inset for one frame, independent of the render loop. */
export function computeLivePipRect(
  frameWidth: number,
  frameHeight: number,
  layout: LiveCompositeLayout,
  cameraAspect = 16 / 9,
): LiveCompositeRect {
  const width = Math.max(1, Math.round(frameWidth));
  const height = Math.max(1, Math.round(frameHeight));
  const scale = clamp(layout.scale, MIN_SCALE, MAX_SCALE);
  const margin = Math.round(
    Math.min(width, height) * clamp(layout.margin, MIN_MARGIN, MAX_MARGIN),
  );
  const aspect =
    Number.isFinite(cameraAspect) && cameraAspect > 0 ? cameraAspect : 16 / 9;
  // A portrait camera must not overflow the frame: fit by both dimensions,
  // then derive the height from the clamped width so the inset keeps its
  // source aspect ratio.
  const maxWidth = Math.max(1, width - margin * 2);
  const maxHeight = Math.max(1, height - margin * 2);
  const pipWidth = Math.max(
    1,
    Math.min(
      Math.round(width * scale),
      maxWidth,
      Math.round(maxHeight * aspect),
    ),
  );
  const pipHeight = Math.max(1, Math.round(pipWidth / aspect));
  const right = width - margin - pipWidth;
  const bottom = height - margin - pipHeight;

  switch (layout.corner) {
    case 'top-left':
      return { x: margin, y: margin, width: pipWidth, height: pipHeight };
    case 'top-right':
      return { x: right, y: margin, width: pipWidth, height: pipHeight };
    case 'bottom-left':
      return { x: margin, y: bottom, width: pipWidth, height: pipHeight };
    default:
      return { x: right, y: bottom, width: pipWidth, height: pipHeight };
  }
}

/** Draw a source into a destination rectangle without stretching it. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const size = sourceSize(source);
  if (!size.width || !size.height || width <= 0 || height <= 0) return;
  const scale = Math.max(width / size.width, height / size.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (size.width - sourceWidth) / 2;
  const sourceY = (size.height - sourceHeight) / 2;
  ctx.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  rect: LiveCompositeRect,
  radius: number,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  } else {
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
  }
}

/**
 * Draw one composite frame: the screen fills the frame, the camera sits in a
 * clipped inset. Audio is never touched here; the caller keeps the original
 * mic and system tracks on the output stream.
 */
export function drawLiveCompositeFrame(
  ctx: CanvasRenderingContext2D,
  screen: CanvasImageSource,
  camera: CanvasImageSource,
  frameWidth: number,
  frameHeight: number,
  layout: LiveCompositeLayout,
): LiveCompositeRect {
  const width = Math.max(1, Math.round(frameWidth));
  const height = Math.max(1, Math.round(frameHeight));
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  drawCover(ctx, screen, 0, 0, width, height);

  const cameraSize = sourceSize(camera);
  const cameraAspect =
    cameraSize.width > 0 && cameraSize.height > 0
      ? cameraSize.width / cameraSize.height
      : 16 / 9;
  const rect = computeLivePipRect(width, height, layout, cameraAspect);
  const radius = Math.max(
    8,
    Math.round(Math.min(rect.width, rect.height) * 0.04),
  );

  ctx.save();
  roundedRectPath(ctx, rect, radius);
  ctx.clip();
  if (layout.mirrorCamera) {
    ctx.translate(rect.x + rect.width, rect.y);
    ctx.scale(-1, 1);
    drawCover(ctx, camera, 0, 0, rect.width, rect.height);
  } else {
    drawCover(ctx, camera, rect.x, rect.y, rect.width, rect.height);
  }
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, rect, radius);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(2, Math.round(width * 0.002));
  ctx.stroke();
  ctx.restore();

  return rect;
}

function attachVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;
  void video.play().catch(() => undefined);
  return video;
}

/**
 * Owns the canvas render loop for a camera + screen composite.
 *
 * The service never stops the source tracks: they are owned by the live
 * capture service so a layout change can keep using them. `stop()` releases
 * only the composite track, the render loop, and the monitor video elements.
 */
@Injectable({ providedIn: 'root' })
export class LiveCaptureCompositorService {
  create(
    screen: MediaStream,
    camera: MediaStream,
    options: Partial<LiveCompositeOptions> = {},
  ): LiveCompositeSession {
    const width = Math.max(1, Math.round(options.width ?? DEFAULT_FRAME.width));
    const height = Math.max(
      1,
      Math.round(options.height ?? DEFAULT_FRAME.height),
    );
    const fps = Math.max(1, Math.round(options.fps ?? DEFAULT_FRAME.fps));
    let layout: LiveCompositeLayout = {
      ...DEFAULT_LIVE_COMPOSITE_LAYOUT,
      ...(options.layout ?? {}),
    };

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('LIVE_COMPOSITE_CANVAS_UNAVAILABLE');
    }
    if (typeof canvas.captureStream !== 'function') {
      throw new Error('LIVE_COMPOSITE_CAPTURE_UNAVAILABLE');
    }

    const screenVideo = attachVideo(screen);
    const cameraVideo = attachVideo(camera);
    const output = canvas.captureStream(fps);
    let running = true;
    let frameHandle: number | null = null;

    const render = (): void => {
      if (!running) return;
      drawLiveCompositeFrame(
        ctx,
        screenVideo,
        cameraVideo,
        width,
        height,
        layout,
      );
      frameHandle = requestAnimationFrame(render);
    };
    frameHandle = requestAnimationFrame(render);

    return {
      stream: output,
      updateLayout(next: Partial<LiveCompositeLayout>): void {
        layout = { ...layout, ...next };
      },
      stop(): void {
        if (!running) return;
        running = false;
        if (frameHandle !== null) cancelAnimationFrame(frameHandle);
        frameHandle = null;
        output.getTracks().forEach((track) => track.stop());
        for (const video of [screenVideo, cameraVideo]) {
          video.pause();
          video.srcObject = null;
        }
      },
    };
  }
}
