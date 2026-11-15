import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The shared dialog is the final stop before unsaved work is replaced, so its
 * actions have to stay reachable on the narrowest phones. jsdom has no layout,
 * so this locks the Tailwind sizing contract instead: 11 = 2.75rem = 44px.
 *
 * The close control also needs `shrink-0`; without it the header's flex row can
 * squeeze the 44px width down to roughly 39px on a 390px screen.
 */
describe('InteractionDialogComponent touch targets', () => {
  const source = readFileSync(
    join(__dirname, 'interaction-dialog.component.ts'),
    'utf8'
  );
  const buttons = [...source.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(
    (match) => match[0]
  );

  it('keeps the close control at a non-shrinking 44px square', () => {
    const close = buttons.find((button) =>
      button.includes('aria-label="Close dialog"')
    );

    expect(close).toBeDefined();
    expect(close).toContain('w-11');
    expect(close).toContain('h-11');
    expect(close).toContain('shrink-0');
  });

  it('keeps every footer action at the 44px touch floor', () => {
    const footer = source.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
    const actions = [...footer.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(
      (match) => match[0]
    );

    expect(actions).toHaveLength(3);
    for (const action of actions) {
      expect(action).toContain('min-h-11');
    }
  });
});
