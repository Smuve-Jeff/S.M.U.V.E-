import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { InteractionDialogComponent } from './interaction-dialog.component';
import { InteractionDialogService } from '../../services/interaction-dialog.service';

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

describe('InteractionDialogComponent focus contract', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.configureTestingModule({ imports: [InteractionDialogComponent] });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('moves focus inside, closes on Escape, and restores the trigger', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();

    const fixture = TestBed.createComponent(InteractionDialogComponent);
    fixture.detectChanges();
    const dialog = TestBed.inject(InteractionDialogService);
    const pending = dialog.confirm({ title: 'Delete?', message: 'Confirm' });
    fixture.detectChanges();
    jest.runOnlyPendingTimers();
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector(
      '[role="dialog"]',
    ) as HTMLElement;
    expect(section).toBeTruthy();
    expect(section.contains(document.activeElement)).toBe(true);

    fixture.componentInstance.onEscape(new Event('keydown', { cancelable: true }));
    await expect(pending).resolves.toBe(false);
    fixture.detectChanges();
    jest.runOnlyPendingTimers();
    expect(document.activeElement).toBe(trigger);
  });

  it('loops Tab from the last control back to the first', () => {
    const fixture = TestBed.createComponent(InteractionDialogComponent);
    fixture.detectChanges();
    const dialog = TestBed.inject(InteractionDialogService);
    dialog.confirm({ title: 'Delete?', message: 'Confirm' });
    fixture.detectChanges();
    jest.runOnlyPendingTimers();
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector(
      '[role="dialog"]',
    ) as HTMLElement;
    const buttons = Array.from(
      section.querySelectorAll<HTMLButtonElement>('button'),
    );
    buttons[buttons.length - 1].focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true,
    });
    fixture.componentInstance.onDialogKeydown(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    dialog.cancel();
  });
});
