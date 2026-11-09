import {
  AI_VFX_PASSES,
  AI_VFX_PRESETS,
  AI_VFX_STYLES,
  buildAiVfxPrompt,
  copyAiVfxSettings,
  describeAiVfx,
  parseAiVfxRecipe,
  presetRecipe,
  renderAiVfx,
  sanitizeAiVfx,
  sanitizeAiVfxRecipe,
} from './ai-vfx';

function fakeContext() {
  const gradient = { addColorStop: jest.fn() };
  return {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    closePath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    arc: jest.fn(),
    ellipse: jest.fn(),
    fill: jest.fn(),
    fillRect: jest.fn(),
    drawImage: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    scale: jest.fn(),
    createRadialGradient: jest.fn(() => gradient),
    createLinearGradient: jest.fn(() => gradient),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
  };
}

describe('AI VFX recipes', () => {
  it('ships shelf looks for every production family', () => {
    for (const style of AI_VFX_STYLES) {
      const family = AI_VFX_PRESETS.filter((preset) => preset.style === style.id);
      expect(family.length).toBeGreaterThanOrEqual(4);
      for (const preset of family) {
        expect(preset.recipe.passes.length).toBeGreaterThan(0);
        expect(preset.recipe.style).toBe(style.id);
        expect(sanitizeAiVfxRecipe(preset.recipe)).not.toBeNull();
      }
    }
    const ids = new Set(AI_VFX_PRESETS.map((preset) => preset.id));
    expect(ids.size).toBe(AI_VFX_PRESETS.length);
  });

  it('parses a fenced model answer and clamps out-of-range values', () => {
    const answer = [
      'Here is the effect:',
      '```json',
      JSON.stringify({
        name: '  Sky Splitter  ',
        description: 'A comic hit with a shockwave.',
        grade: 'vivid',
        pulseBpm: 999,
        passes: [
          { id: 'speed-lines', intensity: 4, palette: ['#fff', '#22d3ee'] },
          { id: 'not-a-pass', intensity: 1 },
          'shockwave',
        ],
      }),
      '```',
    ].join('\n');

    const recipe = parseAiVfxRecipe(answer, 'cartoon', 'comic hit');

    expect(recipe.origin).toBe('ai');
    expect(recipe.name).toBe('Sky Splitter');
    expect(recipe.pulseBpm).toBe(200);
    expect(recipe.passes.map((pass) => pass.id)).toEqual(['speed-lines', 'shockwave']);
    expect(recipe.passes[0].intensity).toBe(1);
    expect(recipe.passes[0].palette).toEqual(['#fff', '#22d3ee']);
  });

  it('falls back to the same family when the answer carries no recipe', () => {
    const prose = parseAiVfxRecipe('The provider is unreachable right now.', 'action');
    const broken = parseAiVfxRecipe('{"passes": [', 'action');

    expect(prose.origin).toBe('preset');
    expect(prose.style).toBe('action');
    expect(prose.passes.length).toBeGreaterThan(0);
    expect(broken.origin).toBe('preset');
    expect(broken.style).toBe('action');
  });

  it('picks the shelf look whose keywords match the brief', () => {
    const recipe = presetRecipe('action', 'a rain-soaked car chase at speed');

    expect(recipe.name).toBe('Speed Storm');
    expect(recipe.passes.some((pass) => pass.id === 'rain')).toBe(true);
  });

  it('sanitises stored settings and copies recipes without sharing passes', () => {
    const neonPulse = AI_VFX_PRESETS.find((preset) => preset.id === 'neon-pulse')!;
    const stored = sanitizeAiVfx({
      enabled: true,
      intensity: 2,
      recipe: neonPulse.recipe,
    });
    expect(stored).not.toBeNull();
    expect(stored!.intensity).toBe(1);

    const copy = copyAiVfxSettings(stored!);
    copy.recipe.passes[0].intensity = 0.01;
    expect(stored!.recipe.passes[0].intensity).not.toBe(0.01);
    expect(copy.recipe.passes[0].palette).not.toBe(stored!.recipe.passes[0].palette);
  });

  it('rejects a record whose passes are all unknown', () => {
    expect(
      sanitizeAiVfx({ recipe: { style: 'action', passes: [{ id: 'nope' }] } })
    ).toBeNull();
    expect(sanitizeAiVfx({ recipe: { style: 'nope', passes: [] } })).toBeNull();
  });

  it('keeps the prompt inside the pass catalogue', () => {
    const prompt = buildAiVfxPrompt('toon chase', 'cartoon', 'movie', 128);

    expect(prompt).toContain('cartoon');
    expect(prompt).toContain('128 BPM');
    expect(prompt).toContain('toon chase');
    for (const pass of AI_VFX_PASSES) {
      expect(prompt).toContain(pass.id);
    }
    expect(prompt).toContain('ONE JSON object');
  });

  it('describes an applied recipe for the panel and reports', () => {
    const settings = {
      enabled: true,
      intensity: 0.5,
      recipe: AI_VFX_PRESETS[0].recipe,
    };
    expect(describeAiVfx(settings)).toContain(AI_VFX_PRESETS[0].name);
    expect(describeAiVfx(settings)).toContain('50%');
  });
});

describe('AI VFX renderer', () => {
  it('renders every shelf recipe without leaking canvas state', () => {
    const ctx = fakeContext();

    for (const preset of AI_VFX_PRESETS) {
      renderAiVfx(
        ctx as unknown as CanvasRenderingContext2D,
        {} as CanvasImageSource,
        { enabled: true, intensity: 1, recipe: preset.recipe },
        1.35,
        1920,
        1080
      );
    }

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.stroke.mock.calls.length + ctx.fill.mock.calls.length).toBeGreaterThan(0);
    expect(ctx.save.mock.calls.length).toBe(ctx.restore.mock.calls.length);
  });

  it('does nothing when the effect is disabled or has no usable recipe', () => {
    const ctx = fakeContext();
    renderAiVfx(
      ctx as unknown as CanvasRenderingContext2D,
      {} as CanvasImageSource,
      { enabled: false, intensity: 1, recipe: AI_VFX_PRESETS[0].recipe },
      0,
      1280,
      720
    );
    renderAiVfx(
      ctx as unknown as CanvasRenderingContext2D,
      {} as CanvasImageSource,
      null,
      0,
      1280,
      720
    );

    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('scales geometry from the frame so a 4K render matches the preview', () => {
    const settings = {
      enabled: true,
      intensity: 1,
      recipe: AI_VFX_PRESETS.find((preset) => preset.id === 'blockbuster-impact')!.recipe,
    };
    const preview = fakeContext();
    const master = fakeContext();

    renderAiVfx(preview as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, settings, 2, 1920, 1080);
    renderAiVfx(master as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, settings, 2, 3840, 2160);

    const previewRadius = (preview.arc as jest.Mock).mock.calls[0][2];
    const masterRadius = (master.arc as jest.Mock).mock.calls[0][2];
    expect(masterRadius / previewRadius).toBeCloseTo(2, 3);
  });
});
