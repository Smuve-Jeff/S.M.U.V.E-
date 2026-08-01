import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TakeLaneComponent } from './take-lane.component';
import { TakeManagerService } from '../../services/take-manager.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { SnackbarService } from '../../services/snackbar.service';
import { HapticService } from '../../services/haptic.service';

describe('TakeLaneComponent (Sprint A3 Phase 3)', () => {
  let component: TakeLaneComponent;
  let fixture: ComponentFixture<TakeLaneComponent>;
  let takeManager: TakeManagerService;

  const mockSnack = {
    success: jest.fn(),
    info: jest.fn(),
    show: jest.fn(),
    error: jest.fn(),
  };
  const mockHaptic = { light: jest.fn(), medium: jest.fn(), impact: jest.fn() };
  const mockMusicManager = {
    tracks: signal([
      {
        id: 'trk1',
        name: 'Lead',
        notes: [
          { id: 'n1', midi: 60, step: 0, length: 2, velocity: 100 },
          { id: 'n2', midi: 64, step: 4, length: 1, velocity: 90 },
        ],
      },
    ]),
    currentStep: signal(8),
    replaceTrackNotes: jest.fn(),
  };

  beforeEach(async () => {
    mockMusicManager.replaceTrackNotes.mockClear();
    mockSnack.success.mockClear();
    mockSnack.info.mockClear();
    await TestBed.configureTestingModule({
      imports: [TakeLaneComponent],
      providers: [
        TakeManagerService,
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: SnackbarService, useValue: mockSnack },
        { provide: HapticService, useValue: mockHaptic },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TakeLaneComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('trackId', 'trk1');
    takeManager = TestBed.inject(TakeManagerService);
    fixture.detectChanges();
  });

  it('renders the empty state when the track has no takes', () => {
    const empty = fixture.nativeElement.querySelector('.take-empty');
    expect(empty).toBeTruthy();
  });

  it('renders one chip per take and marks the active one', () => {
    const a = takeManager.addTake('trk1', 'Take 1', {
      noteCount: 3,
      startStep: 0,
      endStep: 8,
    });
    takeManager.addTake('trk1', 'Take 2');
    takeManager.setActiveTake('trk1', a.id);
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.take-chip');
    expect(chips.length).toBe(2);
    const active = fixture.nativeElement.querySelector('.take-chip.active');
    expect(active?.textContent).toContain('Take 1');
  });

  it('selectTake comp-selects the tapped take (becomes active)', () => {
    const a = takeManager.addTake('trk1', 'Take A');
    const b = takeManager.addTake('trk1', 'Take B');
    component.selectTake(b.id);
    fixture.detectChanges();
    expect(component.activeTakeId()).toBe(b.id);
    expect(takeManager.getActiveTake('trk1')()?.id).toBe(b.id);
    expect(component.activeTakeId()).not.toBe(a.id);
  });

  it('deleteTake removes only the tapped take', () => {
    takeManager.addTake('trk1', 'Take A');
    const b = takeManager.addTake('trk1', 'Take B');
    component.deleteTake(b.id, new MouseEvent('click'));
    fixture.detectChanges();
    const chips = fixture.nativeElement.querySelectorAll('.take-chip');
    expect(chips.length).toBe(1);
    expect(component.takes()[0].id).not.toBe(b.id);
  });

  it('togglePunchIn flips the track punch-in arm', () => {
    component.togglePunchIn();
    expect(takeManager.isPunchIn('trk1')()).toBe(true);
    component.togglePunchIn();
    expect(takeManager.isPunchIn('trk1')()).toBe(false);
  });

  it('stampTake snapshots the track note region into a new active take', () => {
    component.stampTake();
    const takes = takeManager.getTakes('trk1')();
    expect(takes.length).toBe(1);
    expect(takes[0].noteCount).toBe(2);
    expect(takes[0].startStep).toBe(0);
    expect(takes[0].endStep).toBe(5);
    expect(takeManager.getActiveTake('trk1')()?.id).toBe(takes[0].id);
  });

  // ── Sprint A3 Phase 4 — comp stacking ────────────────────────────

  it('comp mode routes chip taps to the ordered comp stack', () => {
    const a = takeManager.addTake('trk1', 'Take A');
    const b = takeManager.addTake('trk1', 'Take B');
    component.toggleCompMode();
    expect(component.compMode()).toBe(true);
    component.onChipTap(a.id);
    component.onChipTap(b.id);
    expect(component.compStack()).toEqual([a.id, b.id]);
    expect(component.compOrderOf(b.id)).toBe(2);
    component.onChipTap(a.id); // toggle off
    expect(component.compStack()).toEqual([b.id]);
  });

  it('applyComp writes the merged comp notes back into the track', () => {
    const a = takeManager.stampTake(
      'trk1',
      'Take A',
      [{ id: 'n1', midi: 60, step: 0, length: 2, velocity: 100 }],
      0
    );
    const b = takeManager.stampTake(
      'trk1',
      'Take B',
      [{ id: 'n1', midi: 60, step: 0, length: 2, velocity: 111 }],
      0
    );
    component.toggleCompMode();
    component.onChipTap(a.id);
    component.onChipTap(b.id);
    component.applyComp();
    expect(mockMusicManager.replaceTrackNotes).toHaveBeenCalledWith(
      'trk1',
      expect.any(Array)
    );
    const merged = mockMusicManager.replaceTrackNotes.mock.calls[0][1];
    expect(merged[0].velocity).toBe(111); // later take wins
    expect(component.compStack()).toEqual([]);
    expect(component.compMode()).toBe(false);
  });

  it('applyComp on an empty stack is a no-op with an info snack', () => {
    component.toggleCompMode();
    component.applyComp();
    expect(mockMusicManager.replaceTrackNotes).not.toHaveBeenCalled();
    expect(mockSnack.info).toHaveBeenCalledWith(
      'Comp stack is empty — tap takes in order first'
    );
  });

  it('clearComp empties the stack without deleting takes', () => {
    const a = takeManager.addTake('trk1', 'Take A');
    component.toggleCompMode();
    component.onChipTap(a.id);
    expect(component.compStack().length).toBe(1);
    component.clearComp();
    expect(component.compStack()).toEqual([]);
    expect(takeManager.getTakes('trk1')().length).toBe(1);
  });

  // ── Sprint A3 Phase 5 — sectional comping ─────────────────────────

  it('assignBar without a picked take is a no-op with an info snack', () => {
    component.toggleSectionMode();
    component.assignBar(1);
    expect(takeManager.sections('trk1')().length).toBe(0);
    expect(mockSnack.info).toHaveBeenCalledWith(
      'Tap a take chip first to pick which take to assign'
    );
  });

  it('pick a take then assignBar creates a section for that bar', () => {
    const a = takeManager.addTake('trk1', 'Take A');
    component.toggleSectionMode();
    component.onChipTap(a.id);
    expect(component.pickedTakeId()).toBe(a.id);
    component.assignBar(2);
    const sections = takeManager.sections('trk1')();
    expect(sections.length).toBe(1);
    expect(sections[0].startStep).toBe(16);
    expect(sections[0].endStep).toBe(32);
    expect(component.sectionForBar(2)?.takeId).toBe(a.id);
    expect(component.sectionForBar(3)).toBeUndefined();
  });

  it('assignBar toggles a section off when re-tapping the same take', () => {
    const a = takeManager.addTake('trk1', 'Take A');
    component.toggleSectionMode();
    component.onChipTap(a.id);
    component.assignBar(1);
    expect(takeManager.sections('trk1')().length).toBe(1);
    component.assignBar(1);
    expect(takeManager.sections('trk1')().length).toBe(0);
  });

  it('applySections bakes the sectional comp and exits section mode', () => {
    const a = takeManager.addTake('trk1', 'Take A');
    component.toggleSectionMode();
    component.onChipTap(a.id);
    component.assignBar(1);
    component.applySections();
    expect(mockMusicManager.replaceTrackNotes).toHaveBeenCalledWith(
      'trk1',
      expect.any(Array)
    );
    expect(component.sectionMode()).toBe(false);
  });

  it('clearSections removes all section assignments', () => {
    const a = takeManager.addTake('trk1', 'Take A');
    component.toggleSectionMode();
    component.onChipTap(a.id);
    component.assignBar(1);
    component.assignBar(2);
    expect(takeManager.sections('trk1')().length).toBe(2);
    component.clearSections();
    expect(takeManager.sections('trk1')().length).toBe(0);
    expect(component.pickedTakeId()).toBeNull();
  });
});
