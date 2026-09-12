import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AiBandComponent } from './ai-band.component';
import { AiService } from '../../services/ai.service';
import { AiMusiciansService } from '../ai-musicians.service';

/**
 * The AI band strip is the only way to engage the virtual session players, so
 * every roster row must be a live, labelled, stateful toggle — not a decoration.
 */
describe('AiBandComponent', () => {
  let fixture: any;
  let component: AiBandComponent;
  let aiMock: any;
  let bandMock: any;

  const roster = [
    { id: 'drummer' as const, label: 'Neural Drummer', detail: 'Kick + backbeat snare' },
    { id: 'bassist' as const, label: 'AI Bassist', detail: 'Octave-down root' },
    { id: 'keyboardist' as const, label: 'AI Keyboardist', detail: 'Fifth-above pads' },
  ];

  beforeEach(() => {
    aiMock = {
      aiDrummerActive: signal(false),
      aiBassistActive: signal(false),
      aiKeyboardistActive: signal(false),
      sessionMusicians: roster,
      isMusicianActive: (who: 'drummer' | 'bassist' | 'keyboardist') =>
        aiMock.musicianSignal(who)(),
      toggleAIMusician: jest.fn((who: 'drummer' | 'bassist' | 'keyboardist') =>
        aiMock.musicianSignal(who).set(!aiMock.musicianSignal(who)())
      ),
      musicianSignal: (who: 'drummer' | 'bassist' | 'keyboardist') =>
        who === 'drummer'
          ? aiMock.aiDrummerActive
          : who === 'bassist'
            ? aiMock.aiBassistActive
            : aiMock.aiKeyboardistActive,
    };
    bandMock = {
      stepsRendered: signal(0),
      lastRendered: signal<{ step: number; musicians: string[] } | null>(null),
    };

    TestBed.configureTestingModule({
      imports: [AiBandComponent],
      providers: [
        { provide: AiService, useValue: aiMock },
        { provide: AiMusiciansService, useValue: bandMock },
      ],
    });

    fixture = TestBed.createComponent(AiBandComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.ai-band-player'));

  it('renders one toggle per session player', () => {
    expect(buttons()).toHaveLength(3);
    expect(fixture.nativeElement.textContent).toContain('Neural Drummer');
    expect(fixture.nativeElement.textContent).toContain('AI Keyboardist');
  });

  it('labels each toggle with its role and what it plays', () => {
    const titles = buttons().map((b) => b.getAttribute('title'));
    expect(titles[0]).toBe('Neural Drummer — Kick + backbeat snare');
  });

  it('starts every player disengaged and reports 0/3', () => {
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'false',
    ]);
    expect(fixture.nativeElement.textContent).toContain('0/3');
    expect(fixture.nativeElement.textContent).toContain('OFF');
  });

  it('engages a player through its own button', () => {
    buttons()[1].click();
    fixture.detectChanges();

    expect(aiMock.toggleAIMusician).toHaveBeenCalledWith('bassist');
    expect(aiMock.aiBassistActive()).toBe(true);
    expect(buttons()[1].getAttribute('aria-pressed')).toBe('true');
    expect(component.engagedCount()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('1/3');
    expect(fixture.nativeElement.textContent).toContain('LIVE');
  });

  it('does not engage the other players when one is toggled', () => {
    buttons()[0].click();
    fixture.detectChanges();

    expect(aiMock.aiDrummerActive()).toBe(true);
    expect(aiMock.aiBassistActive()).toBe(false);
    expect(aiMock.aiKeyboardistActive()).toBe(false);
  });

  it('counts the whole engaged roster', () => {
    aiMock.aiDrummerActive.set(true);
    aiMock.aiKeyboardistActive.set(true);
    fixture.detectChanges();

    expect(component.engagedCount()).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('2/3');
  });

  it('reads STANDING BY until the band has rendered a step', () => {
    expect(fixture.nativeElement.textContent).toContain('STANDING BY');
  });

  it('shows the last step the band actually played', () => {
    bandMock.lastRendered.set({ step: 12, musicians: ['drummer', 'bassist'] });
    fixture.detectChanges();

    const readout = fixture.nativeElement.querySelector('.ai-band-readout');
    expect(readout.textContent).toContain('STEP 12');
    expect(readout.textContent).toContain('DRUMMER + BASSIST');
    expect(readout.classList.contains('is-idle')).toBe(false);
  });

  it('returns to STANDING BY when the band disengages', () => {
    bandMock.lastRendered.set({ step: 4, musicians: ['drummer'] });
    fixture.detectChanges();
    bandMock.lastRendered.set(null);
    fixture.detectChanges();

    const readout = fixture.nativeElement.querySelector('.ai-band-readout');
    expect(readout.textContent).toContain('STANDING BY');
    expect(readout.classList.contains('is-idle')).toBe(true);
  });
});
