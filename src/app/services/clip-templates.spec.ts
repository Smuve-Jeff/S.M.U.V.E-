import { CLIP_TEMPLATES, getClipTemplate, resolveTemplatePatch } from './clip-templates';

describe('clip templates', () => {
  it('ships a shelf of named looks', () => {
    expect(CLIP_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(CLIP_TEMPLATES.map((t) => t.id)).size).toBe(CLIP_TEMPLATES.length);
  });

  it('resolves the velocity ramp against the clip duration', () => {
    const patch = resolveTemplatePatch(getClipTemplate('sports-punch')!, 10);
    const curve = patch.speedCurve as { time: number; speed: number }[];
    expect(curve).toHaveLength(5);
    expect(curve[2]).toEqual({ time: 5.5, speed: 4 });
  });

  it('deep-copies keyframe and fx arrays so clips never share them', () => {
    const template = getClipTemplate('music-beat')!;
    const a = resolveTemplatePatch(template, 10);
    const b = resolveTemplatePatch(template, 10);
    expect(a.keyframes).not.toBe(b.keyframes);
    expect(a.fx).not.toBe(b.fx);
    (a.keyframes as unknown[]).push({ id: 'x' });
    expect((b.keyframes as unknown[]).length).toBeLessThan(
      (a.keyframes as unknown[]).length,
    );
  });

  it('returns undefined for unknown ids', () => {
    expect(getClipTemplate('nope')).toBeUndefined();
  });
});
