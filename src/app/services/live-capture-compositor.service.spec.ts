import {
  computeLivePipRect,
  DEFAULT_LIVE_COMPOSITE_LAYOUT,
  drawLiveCompositeFrame,
  LiveCompositeLayout,
} from './live-capture-compositor.service';

function mockContext(): CanvasRenderingContext2D {
  const ctx = {
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    roundRect: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    drawImage: jest.fn(),
    stroke: jest.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const layout = (overrides: Partial<LiveCompositeLayout> = {}) => ({
  ...DEFAULT_LIVE_COMPOSITE_LAYOUT,
  ...overrides,
});

describe('live capture compositor', () => {
  it('places the camera inset in each corner', () => {
    const frame = { width: 1280, height: 720 };
    const bottomRight = computeLivePipRect(
      1280,
      720,
      layout({ corner: 'bottom-right', scale: 0.25, margin: 0.04 }),
    );
    const topLeft = computeLivePipRect(
      1280,
      720,
      layout({ corner: 'top-left', scale: 0.25, margin: 0.04 }),
    );

    expect(bottomRight).toEqual({ x: 931, y: 511, width: 320, height: 180 });
    expect(topLeft).toEqual({ x: 29, y: 29, width: 320, height: 180 });
    expect(bottomRight.x + bottomRight.width).toBeLessThan(frame.width);
    expect(bottomRight.y + bottomRight.height).toBeLessThan(frame.height);
  });

  it('clamps an oversized camera inset and respects the source aspect', () => {
    const rect = computeLivePipRect(
      1280,
      720,
      layout({ corner: 'top-right', scale: 2, margin: 0 }),
      4 / 3,
    );

    expect(rect.width).toBe(640);
    expect(rect.height).toBe(480);
    expect(rect.x).toBe(640);
    expect(rect.y).toBe(0);
  });

  it('fits a portrait camera inside the frame instead of overflowing it', () => {
    const rect = computeLivePipRect(
      1280,
      720,
      layout({ corner: 'bottom-right', scale: 0.5, margin: 0.04 }),
      9 / 16,
    );
    const margin = Math.round(720 * 0.04);

    expect(rect.width).toBeLessThanOrEqual(1280 - margin * 2);
    expect(rect.height).toBeLessThanOrEqual(720 - margin * 2);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1280);
    expect(rect.y + rect.height).toBeLessThanOrEqual(720);
  });

  it('draws the screen full-frame and mirrors the camera by default', () => {
    const ctx = mockContext();
    const screen = { width: 1920, height: 1080 };
    const camera = { width: 1280, height: 720 };

    const rect = drawLiveCompositeFrame(ctx, screen, camera, 1280, 720, layout());

    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect((ctx.drawImage as jest.Mock).mock.calls[0][0]).toBe(screen);
    expect((ctx.drawImage as jest.Mock).mock.calls[1][0]).toBe(camera);
    expect(ctx.translate).toHaveBeenCalledWith(rect.x + rect.width, rect.y);
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1280, 720);
  });

  it('draws an unmirrored camera without flipping the context', () => {
    const ctx = mockContext();

    drawLiveCompositeFrame(
      ctx,
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      1280,
      720,
      layout({ mirrorCamera: false }),
    );

    expect(ctx.translate).not.toHaveBeenCalled();
    expect(ctx.scale).not.toHaveBeenCalled();
  });
});
