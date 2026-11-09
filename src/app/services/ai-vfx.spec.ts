import {
  AI_VFX_PASSES,
  AI_VFX_PRESETS,
  AI_VFX_STYLES,
  buildAiVfxPrompt,
  buildLocalSectionVfxPlan,
  copyAiVfxSettings,
  inferAiVfxStyle,
  describeAiVfx,
  parseAiVfxRecipe,
  parseAiVfxSectionPlan,
  presetRecipe,
  sanitizeAiVfxSectionPlan,
  renderAiVfx,
  transientEnvelope,
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

describe('AI VFX beat lock', () => {
  it('finds the last onset and reports its age and strength', () => {
    const track = {
      hits: [
        { time: 0.5, strength: 1 },
        { time: 1, strength: 0.6 },
      ],
    };
    const envelope = transientEnvelope(track, 1.02, 0.5);

    expect(envelope.active).toBe(true);
    expect(envelope.age).toBeCloseTo(0.02, 3);
    expect(envelope.strength).toBe(0.6);
    expect(transientEnvelope(track, 1.8, 0.5).active).toBe(false);
  });

  it('wraps hits across the loop boundary of a looping bed', () => {
    const track = { hits: [{ time: 9.8, strength: 0.9 }], loopDuration: 10 };
    const wrapped = transientEnvelope(track, 0.1, 0.5);

    expect(wrapped.active).toBe(true);
    expect(wrapped.age).toBeCloseTo(0.3, 3);
  });

  it('fires the impact recipe on a transient instead of a tempo tick', () => {
    const settings = {
      enabled: true,
      intensity: 1,
      recipe: AI_VFX_PRESETS.find((preset) => preset.id === 'blockbuster-impact')!.recipe,
    };
    const onBeat = fakeContext();
    const between = fakeContext();
    const track = { hits: [{ time: 3, strength: 1 }] };

    renderAiVfx(onBeat as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, settings, 3.01, 1920, 1080, track);
    renderAiVfx(between as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, settings, 4.2, 1920, 1080, track);

    expect((onBeat.arc as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    expect((between.arc as jest.Mock).mock.calls.length).toBe(0);
  });
});

describe('AI VFX section plans', () => {
  const sections = [
    { section: 'Intro', startTime: 0, endTime: 10 },
    { section: 'Chorus 1', startTime: 10, endTime: 30 },
    { section: 'Final Chorus', startTime: 30, endTime: 40 },
  ];

  it('reads the production family from the track brief', () => {
    expect(inferAiVfxStyle('a cartoon chase for the kids', 'music-video')).toBe(
      'cartoon'
    );
    expect(inferAiVfxStyle('an anime storybook interlude', 'action')).toBe(
      'animation'
    );
    expect(inferAiVfxStyle('no styling at all', 'action')).toBe(
      'action'
    );
  });

  it('builds a same-family look for every section, led by the section name', () => {
    const plan = buildLocalSectionVfxPlan(
      'neon club visualizer',
      'music-video',
      sections
    );

    expect(plan.sections).toHaveLength(3);
    expect(plan.sections.map((entry) => entry.recipe.style)).toEqual([
      'music-video',
      'music-video',
      'music-video',
    ]);
    expect(plan.sections[0].recipe.name).toBe('Chrome Leak');
    expect(plan.sections[1].recipe.name).toBe('Neon Pulse');
    expect(plan.sections[2].intensity).toBeGreaterThan(
      plan.sections[0].intensity
    );
    expect(plan.origin).toBe('preset');
  });

  it('accepts a directed section answer and clamps its intensities', () => {
    const answer = JSON.stringify({
      title: 'Night Drive FX',
      sections: [
        { section: 'intro', preset: 'chrome-leak', intensity: 0.3 },
        { section: 'Chorus 1', preset: 'neon-pulse', intensity: 4 },
        { section: 'Final Chorus', preset: 'strobe-burst', intensity: -1 },
      ],
    });

    const plan = parseAiVfxSectionPlan(
      answer,
      'neon performance',
      'music-video',
      sections
    );

    expect(plan.origin).toBe('ai');
    expect(plan.title).toBe('Night Drive FX');
    expect(plan.sections.map((entry) => entry.recipe.name)).toEqual([
      'Chrome Leak',
      'Neon Pulse',
      'Strobe Burst',
    ]);
    expect(plan.sections[1].intensity).toBe(1);
    expect(plan.sections[2].intensity).toBe(0.2);
  });

  it('rejects an out-of-family preset and keeps the local look there', () => {
    const answer = JSON.stringify({
      sections: [
        { section: 'Chorus 1', preset: 'explosion-shockwave', intensity: 0.9 },
      ],
    });

    const plan = parseAiVfxSectionPlan(
      answer,
      'anime interlude',
      'animation',
      sections
    );

    expect(plan.origin).toBe('preset');
    expect(plan.style).toBe('animation');
    expect(plan.sections.every((entry) => entry.recipe.style === 'animation')).toBe(
      true
    );
  });
});

describe('saved AI VFX section plans', () => {
  it('rebuilds a stored plan, clamps intensity and drops unusable entries', () => {
    const neon = AI_VFX_PRESETS.find((preset) => preset.id === 'neon-pulse')!.recipe;
    const action = AI_VFX_PRESETS.find(
      (preset) => preset.id === 'explosion-shockwave'
    )!.recipe;

    const plan = sanitizeAiVfxSectionPlan({
      title: 'Saved FX',
      brief: 'neon performance',
      style: 'music-video',
      origin: 'ai',
      sections: [
        { section: 'Chorus', startTime: 4, endTime: 12, intensity: 4, recipe: neon },
        { section: 'Broken', startTime: 0, endTime: 1, intensity: 0.5, recipe: {} },
        { section: 'Wrong family', startTime: 0, endTime: 1, intensity: 0.5, recipe: action },
      ],
    });

    expect(plan?.sections).toHaveLength(1);
    expect(plan?.sections[0].section).toBe('Chorus');
    expect(plan?.sections[0].intensity).toBe(1);
    expect(plan?.title).toBe('Saved FX');
  });

  it('returns null when a stored plan has no usable section', () => {
    expect(sanitizeAiVfxSectionPlan(null)).toBeNull();
    expect(sanitizeAiVfxSectionPlan({ style: 'music-video', sections: [] })).toBeNull();
    expect(
      sanitizeAiVfxSectionPlan({ style: 'not-a-family', sections: [{}] })
    ).toBeNull();
  });
});
