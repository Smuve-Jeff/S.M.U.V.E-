import {
  FREE_TIER_WATERMARK_LABEL,
  drawWatermarkOnCanvas,
  watermarkPolicyForRole,
} from './watermark-policy';

function createContextStub() {
  const calls: { fillText: string[]; fillRect: number[] } = {
    fillText: [],
    fillRect: [],
  };

  return {
    calls,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    globalAlpha: 1,
    save: jest.fn(),
    restore: jest.fn(),
    fillRect: jest.fn((x: number, y: number, w: number, h: number) => {
      calls.fillRect.push(x, y, w, h);
    }),
    fillText: jest.fn((text: string) => {
      calls.fillText.push(text);
    }),
    measureText: jest.fn((text: string) => ({
      width: Math.ceil(text.length * 5.6),
    })),
  };
}

describe('watermarkPolicyForRole', () => {
  it('watermarks ordinary, unknown and missing roles as free tier', () => {
    expect(watermarkPolicyForRole('Artist')).toMatchObject({
      tier: 'free',
      watermarkRequired: true,
      label: FREE_TIER_WATERMARK_LABEL,
    });
    expect(watermarkPolicyForRole('Guest')).toMatchObject({
      tier: 'free',
      watermarkRequired: true,
    });
    expect(watermarkPolicyForRole(undefined)).toMatchObject({
      tier: 'free',
      watermarkRequired: true,
    });
    expect(watermarkPolicyForRole('future-role')).toMatchObject({
      tier: 'free',
      watermarkRequired: true,
    });
  });

  it('exempts explicit paid and admin roles', () => {
    for (const role of ['premium', 'pro', 'paid', 'enterprise']) {
      expect(watermarkPolicyForRole(role)).toMatchObject({
        tier: 'paid',
        watermarkRequired: false,
      });
    }
    expect(watermarkPolicyForRole('admin')).toMatchObject({
      tier: 'admin',
      watermarkRequired: false,
    });
  });
});

describe('drawWatermarkOnCanvas', () => {
  it('draws the brand badge bottom-right on a free-tier raster', () => {
    const ctx = createContextStub();

    drawWatermarkOnCanvas(
      ctx as unknown as CanvasRenderingContext2D,
      1920,
      1080
    );

    expect(ctx.calls.fillText).toEqual([FREE_TIER_WATERMARK_LABEL]);
    expect(ctx.fillRect).toHaveBeenCalled();
    const [boxX, boxY, boxWidth, boxHeight] = ctx.calls.fillRect;
    expect(boxX + boxWidth).toBeLessThan(1920);
    expect(boxY + boxHeight).toBeLessThan(1080);
    expect(ctx.textAlign).toBe('center');
    expect(ctx.textBaseline).toBe('middle');
  });

  it('does nothing for a paid raster or an empty canvas', () => {
    const paidCtx = createContextStub();
    drawWatermarkOnCanvas(
      paidCtx as unknown as CanvasRenderingContext2D,
      1920,
      1080,
      watermarkPolicyForRole('premium')
    );
    expect(paidCtx.calls.fillText).toEqual([]);

    const emptyCtx = createContextStub();
    drawWatermarkOnCanvas(
      emptyCtx as unknown as CanvasRenderingContext2D,
      0,
      1080
    );
    expect(emptyCtx.calls.fillText).toEqual([]);
  });
});
