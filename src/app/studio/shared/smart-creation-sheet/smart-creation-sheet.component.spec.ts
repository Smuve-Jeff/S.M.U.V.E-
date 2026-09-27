import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SmartCreationSheetComponent, GenreStarter, QuickChordMood } from './smart-creation-sheet.component';
import { HapticService } from '../../../services/haptic.service';
import { IdeasGeneratorService } from '../../../services/ideas-generator.service';
import { MusicManagerService } from '../../../services/music-manager.service';
import { AudioEngineService } from '../../../services/audio-engine.service';
import { SnackbarService } from '../../../services/snackbar.service';
import { UserProfileService } from '../../../services/user-profile.service';
import { signal } from '@angular/core';

/** jsdom has no TouchEvent — build a plain Event carrying a single touch point. */
const touch = (
  type: string,
  point: { clientX?: number; clientY?: number }
): Event => {
  const payload = { clientX: point.clientX ?? 0, clientY: point.clientY ?? 0 };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: [payload] });
  Object.defineProperty(event, 'changedTouches', { value: [payload] });
  return event;
};

/** Vertical touch point, as used by the drag handle. */
const touchEvent = (type: string, clientY: number): Event => touch(type, { clientY });

/** Horizontal touch point, as used by the tab-swipe gesture. */
const swipeEvent = (type: string, clientX: number, clientY = 400): Event =>
  touch(type, { clientX, clientY });

const tap = (target: HTMLElement) =>
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));

const SHEET_MEMORY_KEY = 'smuve_smart_sheet_memory';

const readMemory = () => JSON.parse(window.localStorage.getItem(SHEET_MEMORY_KEY) || 'null');

describe('SmartCreationSheetComponent', () => {
  let component: SmartCreationSheetComponent;
  let fixture: ComponentFixture<SmartCreationSheetComponent>;

  const mockHaptic = {
    light: jest.fn(),
    medium: jest.fn(),
  };

  const mockIdeas = {
    recipes: [
      { id: 'trap', name: 'Trap Elite', tempo: 140, genre: 'Trap', tracks: [] },
      { id: 'rnb', name: 'Smooth R&B', tempo: 92, genre: 'R&B', tracks: [] },
    ],
    recommend: jest.fn().mockReturnValue({ id: 'rec', name: 'Recommended', tempo: 120, genre: 'Pop', tracks: [] }),
    generatePredictiveNotes: jest.fn().mockReturnValue({
      notes: [{ midi: 60, step: 0, length: 4, velocity: 0.8 }],
    }),
  };

  const tracksSignal = signal<any[]>([]);

  const mockMusicManager = {
    tracks: tracksSignal,
    applyGeneratedRecipe: jest.fn(),
    addTrack: jest.fn().mockReturnValue('track_1'),
    replaceTrackNotes: jest.fn(),
  };

  const mockAudioEngine = {
    resume: jest.fn(),
    start: jest.fn(),
    tempo: signal(120),
  };

  const mockSnackbar = {
    success: jest.fn(),
    info: jest.fn(),
  };

  const mockUserProfileService = {
    profile: signal<any>({ settings: { studio: {} } }),
    // Faithful to the real service: the patch is merged into the profile signal
    // so a later read (or a re-created component) observes the write.
    updateProfile: jest.fn((patch: any) => {
      const current = mockUserProfileService.profile();
      mockUserProfileService.profile.set({
        ...current,
        ...patch,
        settings: { ...current.settings, ...patch.settings },
      });
      return Promise.resolve(undefined);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    window.localStorage.removeItem(SHEET_MEMORY_KEY);
    mockUserProfileService.profile.set({ settings: { studio: {} } });
    await TestBed.configureTestingModule({
      imports: [SmartCreationSheetComponent],
      providers: [
        { provide: HapticService, useValue: mockHaptic },
        { provide: IdeasGeneratorService, useValue: mockIdeas },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: SnackbarService, useValue: mockSnackbar },
        { provide: UserProfileService, useValue: mockUserProfileService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SmartCreationSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component and defaults to beats tab', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe('beats');
  });

  it('switches tabs on demand', () => {
    component.setTab('vocals');
    expect(component.activeTab()).toBe('vocals');
    expect(mockHaptic.light).toHaveBeenCalled();

    component.setTab('chords');
    expect(component.activeTab()).toBe('chords');

    component.setTab('ai');
    expect(component.activeTab()).toBe('ai');
  });

  it('loads a genre starter groove into timeline', () => {
    const navigateSpy = jest.spyOn(component.navigateToView, 'emit');
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');

    const starter: GenreStarter = component.genreStarters[0];
    component.loadStarter(starter);

    expect(mockHaptic.medium).toHaveBeenCalled();
    expect(mockAudioEngine.resume).toHaveBeenCalled();
    expect(mockMusicManager.applyGeneratedRecipe).toHaveBeenCalled();
    expect(mockAudioEngine.tempo()).toBe(starter.bpm);
    expect(mockSnackbar.success).toHaveBeenCalledWith(expect.stringContaining(starter.name));
    expect(navigateSpy).toHaveBeenCalledWith('arrangement');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('sets up vocal recording mode', () => {
    tracksSignal.set([]);
    const navigateSpy = jest.spyOn(component.navigateToView, 'emit');
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');

    component.setupVocalRecording();

    expect(mockMusicManager.addTrack).toHaveBeenCalledWith('Lead Vocals', 'grand-piano');
    expect(mockSnackbar.info).toHaveBeenCalledWith(expect.stringContaining('Vocal Booth'));
    expect(navigateSpy).toHaveBeenCalledWith('vocal-suite');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('sets up quick audio memo recorder', () => {
    const navigateSpy = jest.spyOn(component.navigateToView, 'emit');
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');

    component.setupAudioRecorder();

    expect(navigateSpy).toHaveBeenCalledWith('audio-recorder');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('applies chord mood and injects notes', () => {
    const navigateSpy = jest.spyOn(component.navigateToView, 'emit');
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');

    const mood: QuickChordMood = component.chordMoods[0];
    tracksSignal.set([{ id: 'track_keys', name: 'Keys / Chords' }]);

    component.applyChordMood(mood);

    expect(mockIdeas.generatePredictiveNotes).toHaveBeenCalled();
    expect(mockMusicManager.replaceTrackNotes).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('piano-roll');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('navigates to standalone helpers (chord editor, AI produce, drum machine, piano roll)', () => {
    const navigateSpy = jest.spyOn(component.navigateToView, 'emit');
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');

    component.openChordEditor();
    expect(navigateSpy).toHaveBeenCalledWith('chord-editor');
    expect(closeSpy).toHaveBeenCalled();

    component.openAiProduce();
    expect(navigateSpy).toHaveBeenCalledWith('ai-produce');

    component.openDrumMachine();
    expect(navigateSpy).toHaveBeenCalledWith('drum-machine');

    component.openPianoRoll();
    expect(navigateSpy).toHaveBeenCalledWith('piano-roll');
  });

  // ── Touchscreen gestures (drag handle, backdrop, taps) ─────────────

  it('dismisses the sheet when the drag handle is pulled past the threshold', () => {
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');
    const handle: HTMLElement = fixture.nativeElement.querySelector('.sc-drag-handle');
    const sheet: HTMLElement = fixture.nativeElement.querySelector('.sc-sheet');

    handle.dispatchEvent(touchEvent('touchstart', 100));
    handle.dispatchEvent(touchEvent('touchmove', 260));
    fixture.detectChanges();

    expect(component.sheetDragOffset()).toBe(160);
    expect(sheet.style.transform).toContain('translateY(160px)');

    handle.dispatchEvent(new Event('touchend', { bubbles: true }));

    expect(component.sheetDragOffset()).toBe(0);
    expect(mockHaptic.medium).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('snaps back without dismissing when the drag stays under the threshold', () => {
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');
    const handle: HTMLElement = fixture.nativeElement.querySelector('.sc-drag-handle');

    handle.dispatchEvent(touchEvent('touchstart', 200));
    handle.dispatchEvent(touchEvent('touchmove', 240));
    expect(component.sheetDragOffset()).toBe(40);

    // Upward pulls must not lift the sheet off the bottom edge.
    handle.dispatchEvent(touchEvent('touchmove', 120));
    expect(component.sheetDragOffset()).toBe(0);

    handle.dispatchEvent(new Event('touchend', { bubbles: true }));

    expect(component.sheetDragOffset()).toBe(0);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('resets the drag on touchcancel without dismissing', () => {
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');
    const handle: HTMLElement = fixture.nativeElement.querySelector('.sc-drag-handle');

    handle.dispatchEvent(touchEvent('touchstart', 100));
    handle.dispatchEvent(touchEvent('touchmove', 400));
    expect(component.sheetDragOffset()).toBe(300);

    handle.dispatchEvent(new Event('touchcancel', { bubbles: true }));

    expect(component.sheetDragOffset()).toBe(0);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('ignores touchmove events before a drag has started', () => {
    const handle: HTMLElement = fixture.nativeElement.querySelector('.sc-drag-handle');

    handle.dispatchEvent(touchEvent('touchmove', 300));

    expect(component.sheetDragOffset()).toBe(0);
  });

  it('closes the sheet when the mobile backdrop is tapped', () => {
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');

    tap(fixture.nativeElement.querySelector('.sc-backdrop'));

    expect(closeSpy).toHaveBeenCalled();
  });

  it('switches panels when a workflow tab is tapped', () => {
    const tabs: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.sc-tab'));

    expect(tabs).toHaveLength(4);
    expect(fixture.nativeElement.querySelector('.sc-starters-grid')).toBeTruthy();

    tap(tabs[1]);
    fixture.detectChanges();

    expect(component.activeTab()).toBe('vocals');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.querySelector('.sc-vocal-presets-grid')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.sc-starters-grid')).toBeFalsy();
  });

  // ── Vocal preset packs ────────────────────────────────────────────

  it('renders a one-tap card for every vocal preset', () => {
    component.setTab('vocals');
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.sc-vocal-preset-card');

    expect(component.vocalPresets.length).toBeGreaterThanOrEqual(5);
    expect(cards.length).toBe(component.vocalPresets.length);
    expect(cards[0].getAttribute('aria-label')).toContain(component.vocalPresets[0].name);
  });

  it('arms a vocal preset on tap: adds a vocal track and opens the booth', () => {
    tracksSignal.set([]);
    const navigateSpy = jest.spyOn(component.navigateToView, 'emit');
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');
    const preset = component.vocalPresets[0];

    component.setTab('vocals');
    fixture.detectChanges();
    tap(fixture.nativeElement.querySelector('.sc-vocal-preset-card'));

    expect(mockHaptic.medium).toHaveBeenCalled();
    expect(mockAudioEngine.resume).toHaveBeenCalled();
    expect(mockMusicManager.addTrack).toHaveBeenCalledWith('Lead Vocals', 'grand-piano');
    expect(mockSnackbar.success).toHaveBeenCalledWith(expect.stringContaining(preset.name));
    expect(navigateSpy).toHaveBeenCalledWith('vocal-suite');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('reuses an existing vocal track instead of stacking duplicates', () => {
    tracksSignal.set([{ id: 'track_vox', name: 'Lead Vocals' }]);
    const preset = component.vocalPresets[1];

    component.applyVocalPreset(preset);

    expect(mockMusicManager.addTrack).not.toHaveBeenCalled();
    expect(mockSnackbar.success).toHaveBeenCalledWith(expect.stringContaining(preset.chain[0]));
  });

  // ── Swipe between workflow tabs ────────────────────────────────────

  it('swipes forward and backward between workflow tabs', () => {
    const content: HTMLElement = fixture.nativeElement.querySelector('.sc-content');

    content.dispatchEvent(swipeEvent('touchstart', 300));
    content.dispatchEvent(swipeEvent('touchend', 180));
    expect(component.activeTab()).toBe('vocals');

    content.dispatchEvent(swipeEvent('touchstart', 180));
    content.dispatchEvent(swipeEvent('touchend', 300));
    expect(component.activeTab()).toBe('beats');
  });

  it('walks the whole tab strip with repeated swipes', () => {
    const content: HTMLElement = fixture.nativeElement.querySelector('.sc-content');
    const swipeLeft = () => {
      content.dispatchEvent(swipeEvent('touchstart', 300));
      content.dispatchEvent(swipeEvent('touchend', 160));
    };

    swipeLeft();
    expect(component.activeTab()).toBe('vocals');
    swipeLeft();
    expect(component.activeTab()).toBe('chords');
    swipeLeft();
    expect(component.activeTab()).toBe('ai');

    // No wrap-around past the last tab.
    swipeLeft();
    expect(component.activeTab()).toBe('ai');
  });

  it('ignores vertical scroll flicks and cancelled swipes', () => {
    const content: HTMLElement = fixture.nativeElement.querySelector('.sc-content');

    // Mostly vertical travel — the scroller owns this gesture.
    content.dispatchEvent(swipeEvent('touchstart', 300, 200));
    content.dispatchEvent(swipeEvent('touchend', 200, 320));
    expect(component.activeTab()).toBe('beats');

    // Diagonal drift under the threshold must not flip tabs either.
    content.dispatchEvent(swipeEvent('touchstart', 300, 400));
    content.dispatchEvent(swipeEvent('touchend', 270, 405));
    expect(component.activeTab()).toBe('beats');

    // touchcancel (scroll takeover) drops the gesture.
    content.dispatchEvent(swipeEvent('touchstart', 300));
    content.dispatchEvent(new Event('touchcancel', { bubbles: true }));
    content.dispatchEvent(swipeEvent('touchend', 160));
    expect(component.activeTab()).toBe('beats');
  });

  // ── Flick dismissal from the whole sheet chrome ─────────────────────

  it('dismisses on a quick downward flick that stops short of the threshold', () => {
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');
    const header: HTMLElement = fixture.nativeElement.querySelector('.sc-header');

    jest.useFakeTimers();
    try {
      header.dispatchEvent(touchEvent('touchstart', 200));
      jest.advanceTimersByTime(60);
      header.dispatchEvent(touchEvent('touchmove', 245)); // 45px in 60ms ≈ 0.75 px/ms
      header.dispatchEvent(new Event('touchend', { bubbles: true }));
    } finally {
      jest.useRealTimers();
    }

    expect(closeSpy).toHaveBeenCalled();
  });

  it('does not treat a slow short drag as a flick', () => {
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');
    const header: HTMLElement = fixture.nativeElement.querySelector('.sc-header');

    jest.useFakeTimers();
    try {
      header.dispatchEvent(touchEvent('touchstart', 200));
      jest.advanceTimersByTime(400);
      header.dispatchEvent(touchEvent('touchmove', 245)); // same 45px, far too slow
      header.dispatchEvent(new Event('touchend', { bubbles: true }));
    } finally {
      jest.useRealTimers();
    }

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('never lets a drag inside the scrolling panel move the sheet', () => {
    const closeSpy = jest.spyOn(component.closeSheet, 'emit');
    const content: HTMLElement = fixture.nativeElement.querySelector('.sc-content');

    content.dispatchEvent(touchEvent('touchstart', 300));
    content.dispatchEvent(touchEvent('touchmove', 500));
    content.dispatchEvent(new Event('touchend', { bubbles: true }));

    expect(component.sheetDragOffset()).toBe(0);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  // ── Remembering the last pack & preset ─────────────────────────────

  it('persists the last groove, preset and tab, then restores them on relaunch', () => {
    const starter = component.genreStarters[2];
    const preset = component.vocalPresets[3];

    component.loadStarter(starter);
    component.applyVocalPreset(preset);
    component.setTab('chords');

    expect(readMemory()).toMatchObject({
      lastStarterId: starter.id,
      lastVocalPresetId: preset.id,
      lastTab: 'chords',
      updatedAt: expect.any(Number),
    });
    // Per-item stamps ride in the same payload so the Recent row survives too.
    expect(Object.keys(readMemory().recent)).toEqual([
      `starter:${starter.id}`,
      `vocal:${preset.id}`,
    ]);

    // A fresh instance stands in for the next launch.
    const relaunched = TestBed.createComponent(SmartCreationSheetComponent);
    relaunched.detectChanges();
    const fresh = relaunched.componentInstance;

    expect(fresh.activeTab()).toBe('chords');
    expect(fresh.lastStarter()?.id).toBe(starter.id);
    expect(fresh.lastVocalPreset()?.id).toBe(preset.id);

    // Recency: the last-used pack leads its grid.
    expect(fresh.orderedStarters()[0].id).toBe(starter.id);
    expect(fresh.orderedVocalPresets()[0].id).toBe(preset.id);

    fresh.setTab('beats');
    relaunched.detectChanges();
    const resumeBar: HTMLElement = relaunched.nativeElement.querySelector('.sc-resume-bar');
    expect(resumeBar.textContent).toContain(starter.name);
    expect(relaunched.nativeElement.querySelectorAll('.sc-last-used-chip')).toHaveLength(1);

    const closeSpy = jest.spyOn(fresh.closeSheet, 'emit');
    tap(resumeBar);

    expect(mockMusicManager.applyGeneratedRecipe).toHaveBeenCalled();
    expect(mockAudioEngine.tempo()).toBe(starter.bpm);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('re-arms the last vocal preset from the resume bar', () => {
    component.applyVocalPreset(component.vocalPresets[2]);

    const relaunched = TestBed.createComponent(SmartCreationSheetComponent);
    relaunched.detectChanges();
    const fresh = relaunched.componentInstance;
    fresh.setTab('vocals');
    relaunched.detectChanges();

    const resumeBar: HTMLElement = relaunched.nativeElement.querySelector('.sc-resume-bar');
    expect(resumeBar.textContent).toContain(fresh.vocalPresets[2].name);

    tap(resumeBar);

    expect(mockSnackbar.success).toHaveBeenCalledWith(
      expect.stringContaining(fresh.vocalPresets[2].name)
    );
  });

  it('remembers the last chord mood and pins it to the front of the grid', () => {
    const mood = component.chordMoods[4];

    component.applyChordMood(mood);

    expect(component.lastChordMoodId()).toBe(mood.id);
    expect(component.orderedChordMoods()[0].id).toBe(mood.id);
    expect(readMemory()).toMatchObject({
      lastChordMoodId: mood.id,
      recent: { [`chord:${mood.id}`]: expect.any(Number) },
    });

    const relaunched = TestBed.createComponent(SmartCreationSheetComponent);
    relaunched.detectChanges();
    const fresh = relaunched.componentInstance;
    fresh.setTab('chords');
    relaunched.detectChanges();

    expect(fresh.activeTab()).toBe('chords');
    expect(fresh.lastChordMood()?.id).toBe(mood.id);
    expect(fresh.orderedChordMoods()[0].id).toBe(mood.id);

    const cards = relaunched.nativeElement.querySelectorAll('.sc-chord-mood-card');
    expect(cards[0].getAttribute('aria-label')).toContain(mood.label);
    expect(relaunched.nativeElement.querySelectorAll('.sc-last-used-chip')).toHaveLength(1);
    const resumeBar: HTMLElement = relaunched.nativeElement.querySelector('.sc-resume-bar');
    expect(resumeBar.textContent).toContain(mood.label);
  });

  it('ignores stored recall that no longer matches a pack', () => {
    window.localStorage.setItem(
      SHEET_MEMORY_KEY,
      JSON.stringify({
        lastStarterId: 'deleted-pack',
        lastVocalPresetId: 'deleted-preset',
        lastChordMoodId: 'deleted-mood',
        lastTab: 'not-a-tab',
        updatedAt: Date.now(),
        recent: { 'starter:deleted-pack': Date.now(), 'chord:deleted-mood': Date.now() },
      })
    );

    const fresh = TestBed.createComponent(SmartCreationSheetComponent).componentInstance;

    expect(fresh.activeTab()).toBe('beats');
    expect(fresh.lastStarter()).toBeNull();
    expect(fresh.lastVocalPreset()).toBeNull();
    expect(fresh.lastChordMood()).toBeNull();
    expect(fresh.lastStarterId()).toBeNull();
    expect(fresh.orderedStarters()).toEqual(fresh.genreStarters);
    expect(fresh.orderedChordMoods()).toEqual(fresh.chordMoods);
    expect(fresh.recentItems()).toEqual([]);
  });

  // ── Combined Recently Used row ─────────────────────────────────────

  it('stays hidden until something has been used, then caps at four entries', () => {
    expect(component.recentItems()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.sc-recent-row')).toBeFalsy();

    jest.useFakeTimers();
    try {
      for (const starter of component.genreStarters.slice(0, 3)) {
        component.loadStarter(starter);
        jest.advanceTimersByTime(12);
      }
      component.applyVocalPreset(component.vocalPresets[0]);
      component.applyChordMood(component.chordMoods[0]);
    } finally {
      jest.useRealTimers();
    }

    expect(Object.keys(component.recentUsage())).toHaveLength(5);
    expect(component.recentItems()).toHaveLength(4);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.sc-recent-chip')).toHaveLength(4);
  });

  it('orders the Recent row newest-first across all three catalogues', () => {
    jest.useFakeTimers();
    try {
      component.loadStarter(component.genreStarters[1]);
      jest.advanceTimersByTime(50);
      component.applyVocalPreset(component.vocalPresets[0]);
      jest.advanceTimersByTime(50);
      component.applyChordMood(component.chordMoods[0]);
    } finally {
      jest.useRealTimers();
    }

    const items = component.recentItems();

    expect(items.map((item) => item.kind)).toEqual(['Chords', 'Vocal', 'Pack']);
    expect(items.map((item) => item.key)).toEqual([
      `chord:${component.chordMoods[0].id}`,
      `vocal:${component.vocalPresets[0].id}`,
      `starter:${component.genreStarters[1].id}`,
    ]);

    fixture.detectChanges();
    const chips = Array.from(
      fixture.nativeElement.querySelectorAll('.sc-recent-chip')
    ) as HTMLElement[];
    expect(chips).toHaveLength(3);
    expect(chips[0].textContent).toContain(component.chordMoods[0].label);
    expect(chips[0].textContent).toContain('Chords');
    expect(chips[2].textContent).toContain('Pack');
  });

  it('reuses Recent chips through their own action paths', () => {
    const starter = component.genreStarters[4];
    const preset = component.vocalPresets[3];

    component.loadStarter(starter);
    component.applyVocalPreset(preset);
    fixture.detectChanges();

    const chipFor = (kind: string) =>
      (Array.from(fixture.nativeElement.querySelectorAll('.sc-recent-chip')) as HTMLElement[]).find(
        (chip) => chip.textContent?.includes(kind)
      )!;

    tap(chipFor('Pack'));
    expect(mockAudioEngine.tempo()).toBe(starter.bpm);
    expect(mockMusicManager.applyGeneratedRecipe).toHaveBeenCalled();

    tap(chipFor('Vocal'));
    expect(mockSnackbar.success).toHaveBeenCalledWith(expect.stringContaining(preset.name));
  });

  it('injects a chord progression from its Recent chip', () => {
    tracksSignal.set([{ id: 'track_keys', name: 'Keys / Chords' }]);
    const navigateSpy = jest.spyOn(component.navigateToView, 'emit');
    const mood = component.chordMoods[2];

    component.applyChordMood(mood);
    fixture.detectChanges();

    const chip = (Array.from(
      fixture.nativeElement.querySelectorAll('.sc-recent-chip')
    ) as HTMLElement[]).find((entry) => entry.textContent?.includes('Chords'))!;
    expect(chip.textContent).toContain(mood.label);

    tap(chip);

    expect(mockMusicManager.replaceTrackNotes).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('piano-roll');
  });

  it('merges per-item Recent stamps from this device and the account', () => {
    const now = Date.now();
    window.localStorage.setItem(
      SHEET_MEMORY_KEY,
      JSON.stringify({ lastStarterId: 'lofi', updatedAt: now, recent: { 'starter:lofi': now } })
    );
    mockUserProfileService.profile.set({
      settings: {
        studio: {
          smartSheet: {
            lastVocalPresetId: 'crisp-radio',
            updatedAt: now - 1000,
            recent: { 'vocal:crisp-radio': now - 1000, 'starter:lofi': now - 5000 },
          },
        },
      },
    });

    const fresh = TestBed.createComponent(SmartCreationSheetComponent).componentInstance;

    // Both devices' history feeds the row, newest stamp per key winning.
    expect(fresh.recentItems().map((item) => item.key)).toEqual([
      'starter:lofi',
      'vocal:crisp-radio',
    ]);
    expect(fresh.recentUsage()['starter:lofi']).toBe(now);
    // The last-used ids still follow the newer blob (this device's copy).
    expect(fresh.lastStarter()?.id).toBe('lofi');
    expect(fresh.lastVocalPreset()).toBeNull();
  });

  // ── Account sync ───────────────────────────────────────────────────

  it('adopts the account recall on a device that has none', () => {
    mockUserProfileService.profile.set({
      settings: {
        studio: {
          smartSheet: {
            lastStarterId: 'afrobeats',
            lastVocalPresetId: 'vintage-tube',
            lastChordMoodId: 'gospel',
            lastTab: 'vocals',
            updatedAt: 1_700_000_000_000,
          },
        },
      },
    });

    const fresh = TestBed.createComponent(SmartCreationSheetComponent).componentInstance;

    expect(fresh.activeTab()).toBe('vocals');
    expect(fresh.lastStarter()?.id).toBe('afrobeats');
    expect(fresh.lastVocalPreset()?.id).toBe('vintage-tube');
    expect(fresh.lastChordMood()?.id).toBe('gospel');
    // ...and the recalled entries lead their grids.
    expect(fresh.orderedStarters()[0].id).toBe('afrobeats');
    expect(fresh.orderedVocalPresets()[0].id).toBe('vintage-tube');
    expect(fresh.orderedChordMoods()[0].id).toBe('gospel');
  });

  it('prefers whichever recall — this device or the account — is newer', () => {
    const now = Date.now();
    const account = (updatedAt: number) => ({
      lastStarterId: 'synthwave',
      lastTab: 'chords',
      updatedAt,
    });
    const local = (updatedAt: number) => ({
      lastStarterId: 'lofi',
      lastTab: 'beats',
      updatedAt,
    });

    // The account was touched on another device after this one.
    mockUserProfileService.profile.set({ settings: { studio: { smartSheet: account(now + 60_000) } } });
    window.localStorage.setItem(SHEET_MEMORY_KEY, JSON.stringify(local(now)));

    const accountWins = TestBed.createComponent(SmartCreationSheetComponent).componentInstance;
    expect(accountWins.lastStarter()?.id).toBe('synthwave');
    expect(accountWins.activeTab()).toBe('chords');

    // This device was used most recently, so its copy wins.
    mockUserProfileService.profile.set({ settings: { studio: { smartSheet: account(now) } } });
    window.localStorage.setItem(SHEET_MEMORY_KEY, JSON.stringify(local(now + 60_000)));

    const localWins = TestBed.createComponent(SmartCreationSheetComponent).componentInstance;
    expect(localWins.lastStarter()?.id).toBe('lofi');
    expect(localWins.activeTab()).toBe('beats');
  });

  it('coalesces recall writes into one debounced account push', () => {
    const preset = component.vocalPresets[1];

    jest.useFakeTimers();
    try {
      component.setTab('vocals');
      component.applyVocalPreset(preset);
      component.applyVocalPreset(component.vocalPresets[2]);

      // Still inside the debounce window — nothing pushed yet.
      expect(mockUserProfileService.updateProfile).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1000);
    } finally {
      jest.useRealTimers();
    }

    expect(mockUserProfileService.updateProfile).toHaveBeenCalledTimes(1);
    const pushed = mockUserProfileService.updateProfile.mock.calls[0][0];
    expect(pushed.settings.studio.smartSheet).toMatchObject({
      lastVocalPresetId: component.vocalPresets[2].id,
      lastTab: 'vocals',
    });
  });

  it('flushes a pending account push when the sheet closes mid-window', () => {
    component.applyVocalPreset(component.vocalPresets[0]);
    expect(mockUserProfileService.updateProfile).not.toHaveBeenCalled();

    fixture.destroy();

    expect(mockUserProfileService.updateProfile).toHaveBeenCalledTimes(1);
  });

  // ── Template packs: new genre starters & chord moods ──────────────

  it('exposes the new genre template packs and chord moods', () => {
    const starterIds = component.genreStarters.map((s) => s.id);
    const chordIds = component.chordMoods.map((m) => m.id);

    expect(starterIds).toEqual(
      expect.arrayContaining(['afrobeats', 'synthwave', 'boombap', 'reggaeton'])
    );
    expect(chordIds).toEqual(expect.arrayContaining(['cinematic', 'gospel', 'cyberpunk']));

    component.setTab('beats');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.sc-starter-card').length).toBe(
      component.genreStarters.length
    );

    component.setTab('chords');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.sc-chord-mood-card').length).toBe(
      component.chordMoods.length
    );
  });
});
