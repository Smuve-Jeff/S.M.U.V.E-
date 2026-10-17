import { AI_MAX_PROMPT_LENGTH, boundAiPrompt, isOfflineAiText } from './ai-manager.contract';

describe('Shared AI request contract', () => {
  it('retains a full 3000-character request while bounding background', () => {
    const request = 'artist intent '.repeat(230).slice(0, 3000);
    const bounded = boundAiPrompt(`${'context'.repeat(4000)}ARTIST REQUEST: ${request}`, 'Core contract');
    expect(bounded.length).toBeLessThanOrEqual(AI_MAX_PROMPT_LENGTH);
    expect(bounded.endsWith(request)).toBe(true);
  });
  it('rejects oversized requests rather than silently truncating intent', () => {
    expect(() => boundAiPrompt('a'.repeat(3001), 'Core')).toThrow('3000');
  });
  it('recognizes offline replies across persona casing', () => {
    expect(isOfflineAiText('Strategic link severed.')).toBe(true);
    expect(isOfflineAiText('Measured result')).toBe(false);
  });
});
