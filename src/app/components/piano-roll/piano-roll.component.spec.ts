import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  MusicManagerService,
  TrackNote,
} from '../../services/music-manager.service';
import { PianoRollComponent } from './piano-roll.component';

/** Minimal 2D context: jsdom has no canvas backend, so the component draws into this. */
function createContextMock() {
  return {
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    arc: jest.fn(),
    fillText: jest.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
  };
}

interface MockTrack {
  id: string;
  name: string;
  notes: TrackNote[];
  synthParams?: any;
}

/**
 * MusicManager mock whose history-aware helpers really mutate the track
 * signal, so the component's resync effect behaves like it does in the app.
 */
function buildMusicManagerMock() {
  const tracks = signal<MockTrack[]>([]);
  const selectedTrackId = signal<string | null>(null);
  const playSynth = jest.fn();
  const addNoteToTrack = jest.fn((trackId: string, note: TrackNote) =>
    tracks.update((ts) =>
      ts.map((t) =>
        t.id === trackId ? { ...t, notes: [...t.notes, note] } : t
      )
    )
  );
  const removeNotes = jest.fn((trackId: string, ids: string[]) =>
    tracks.update((ts) =>
      ts.map((t) =>
        t.id === trackId
          ? { ...t, notes: t.notes.filter((n) => !ids.includes(n.id)) }
          : t
      )
    )
  );
  const updateNote = jest.fn(
    (trackId: string, noteId: string, patch: Partial<TrackNote>) =>
      tracks.update((ts) =>
        ts.map((t) =>
          t.id === trackId
            ? {
                ...t,
                notes: t.notes.map((n) =>
                  n.id === noteId ? { ...n, ...patch } : n
                ),
              }
            : t
        )
      )
  );
  return {
    tracks,
    selectedTrackId,
    selectedTrack: () =>
      tracks().find((t) => t.id === selectedTrackId()) ?? null,
    addNoteToTrack,
    removeNotes,
    updateNote,
    engine: {
      tempo: signal(120),
      ctx: { currentTime: 0 },
      playSynth,
      isPlaying: signal(false),
      visualStep: signal(0),
      start: jest.fn(),
      stop: jest.fn(),
    },
  };
}

describe('PianoRollComponent (canvas editor)', () => {
  // Component geometry defaults.
  const ROW_OFFSET = 60;
  const CELL_WIDTH = 32;
  const CELL_HEIGHT = 20;
  const PITCH_COUNT = 84 - 48 + 1;
  const GRID_HEIGHT = PITCH_COUNT * CELL_HEIGHT;

  let fixture: ComponentFixture<PianoRollComponent>;
  let component: PianoRollComponent;
  let ctx: ReturnType<typeof createContextMock>;
  let musicManager: ReturnType<typeof buildMusicManagerMock>;

  const pointer = (clientX: number, clientY: number, pointerId = 1) =>
    ({ clientX, clientY, pointerId }) as unknown as PointerEvent;

  /** Canvas coordinates for a grid cell (step, midi pitch). */
  const cell = (step: number, pitch: number) => ({
    x: ROW_OFFSET + step * CELL_WIDTH + CELL_WIDTH / 2,
    y: (84 - pitch) * CELL_HEIGHT + CELL_HEIGHT / 2,
  });

  beforeEach(async () => {
    ctx = createContextMock();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);

    musicManager = buildMusicManagerMock();

    await TestBed.configureTestingModule({
      imports: [PianoRollComponent],
      providers: [
        { provide: MusicManagerService, useValue: musicManager },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PianoRollComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    jest
      .spyOn(component.canvasRef.nativeElement, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 0 } as DOMRect);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sizes the canvas for the pitch range and draws on init', () => {
    const canvas = component.canvasRef.nativeElement;
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(canvas.width).toBe(component.totalSteps * CELL_WIDTH + ROW_OFFSET);
    expect(canvas.height).toBe(GRID_HEIGHT + component.velocityLaneHeight);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('starts with the default demo phrase', () => {
    expect(component.notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
    expect(component.selectedNote).toBeNull();
  });

  describe('note editing', () => {
    it('adds a note on the pitch row that was clicked', () => {
      const target = cell(0, 81);
      component.onPointerDown(pointer(target.x, target.y));

      const added = component.notes.find((note) => note.pitch === 81);
      expect(added).toBeDefined();
      expect(added!.velocity).toBe(component.defaultVelocity);
      expect(component.selectedNote).toBe(added);
    });

    it.each([
      [1, 5, 5],
      [4, 5, 4],
      [8, 9, 8],
      [16, 9, 0],
    ])('quantises a new note to the snap grid (%i -> step %i = %i)', (snap, clickStep, expectedStep) => {
      component.snapGrid = snap;
      const target = cell(clickStep, 81);
      component.onPointerDown(pointer(target.x, target.y));

      const added = component.notes.find((note) => note.pitch === 81);
      expect(added).toBeDefined();
      expect(added!.startStep).toBe(expectedStep);
    });

    it('selects an existing note instead of stacking a duplicate', () => {
      const existing = component.notes[0];
      const before = component.notes.length;

      const target = cell(existing.startStep, existing.pitch);
      component.onPointerDown(pointer(target.x, target.y));

      expect(component.notes).toHaveLength(before);
      expect(component.selectedNote).toBe(existing);
    });

    it('ignores clicks on the keyboard gutter', () => {
      const before = component.notes.length;
      component.onPointerDown(pointer(10, 200));

      expect(component.notes).toHaveLength(before);
      expect(component.selectedNote).toBeNull();
    });

    it('deletes the selected note', () => {
      const existing = component.notes[0];
      const target = cell(existing.startStep, existing.pitch);
      component.onPointerDown(pointer(target.x, target.y));

      component.deleteSelectedNote();

      expect(component.notes).toHaveLength(2);
      expect(component.notes.some((note) => note.id === existing.id)).toBe(false);
      expect(component.selectedNote).toBeNull();
    });

    it('does nothing when no note is selected', () => {
      component.deleteSelectedNote();
      expect(component.notes).toHaveLength(3);
    });

    it('repaints after an edit', () => {
      const target = cell(0, 81);
      component.onPointerDown(pointer(target.x, target.y));

      expect(ctx.clearRect).toHaveBeenCalled();
      expect(ctx.fillRect).toHaveBeenCalled();
    });
  });

  describe('grid boundaries', () => {
    /** Every note must be drawable — outside the range it is invisible and unclickable. */
    const expectNotesToBeReachable = () => {
      for (const note of component.notes) {
        expect(note.pitch).toBeGreaterThanOrEqual(component.minPitch);
        expect(note.pitch).toBeLessThanOrEqual(component.maxPitch);
        expect(note.startStep).toBeGreaterThanOrEqual(0);
        expect(note.startStep).toBeLessThan(component.totalSteps);
      }
    };

    it('does not create a note above the canvas', () => {
      const target = cell(20, 81);
      component.onPointerDown(pointer(target.x, -5));

      expect(component.notes).toHaveLength(3);
      expectNotesToBeReachable();
    });

    it('does not create a note past the last step', () => {
      const canvas = component.canvasRef.nativeElement;
      component.onPointerDown(pointer(canvas.width, 200));

      expect(component.notes).toHaveLength(3);
      expectNotesToBeReachable();
    });

    it('treats the grid line itself as the start of the velocity lane', () => {
      const existing = component.notes[0];
      const x = ROW_OFFSET + existing.startStep * CELL_WIDTH + 2;

      component.onPointerDown(pointer(x, GRID_HEIGHT));

      expect(component.selectedNote).toBe(existing);
      expect(existing.velocity).toBe(127);
      expect(component.notes).toHaveLength(3); // no note for the boundary row
    });

    it('keeps every created note inside the visible range across edge clicks', () => {
      const canvas = component.canvasRef.nativeElement;
      const edgeClicks = [
        [ROW_OFFSET, 0],
        [ROW_OFFSET, GRID_HEIGHT - 1],
        [canvas.width, GRID_HEIGHT - 1],
        [ROW_OFFSET + 5 * CELL_WIDTH, -1],
      ];

      for (const [x, y] of edgeClicks) {
        component.onPointerDown(pointer(x, y));
      }

      expectNotesToBeReachable();
    });
  });

  describe('velocity lane', () => {
    // The lane starts on the row *below* the grid line (y > gridHeight) and the
    // 1..65 travel maps to velocity 0..127.
    const LANE_TOP = GRID_HEIGHT + 1;
    const LANE_BOTTOM = GRID_HEIGHT + 65;
    const noteX = (step: number) => ROW_OFFSET + step * CELL_WIDTH + 2;

    it('lowers the velocity of the note under the cursor', () => {
      const existing = component.notes[0];

      component.onPointerDown(pointer(noteX(existing.startStep), LANE_TOP));

      expect(component.selectedNote).toBe(existing);
      expect(existing.velocity).toBe(125);
    });

    it('follows the drag to the bottom of the lane', () => {
      const existing = component.notes[0];

      component.onPointerDown(pointer(noteX(existing.startStep), LANE_TOP));
      component.onPointerMove(pointer(noteX(existing.startStep), LANE_BOTTOM));

      expect(existing.velocity).toBe(0);
    });

    it('clamps drags above the lane to full velocity', () => {
      const existing = component.notes[0];

      component.onPointerDown(pointer(noteX(existing.startStep), LANE_BOTTOM));
      component.onPointerMove(pointer(noteX(existing.startStep), GRID_HEIGHT - 40));

      expect(existing.velocity).toBe(127);
    });

    it('stops tracking after the pointer is released', () => {
      const existing = component.notes[0];
      const startY = GRID_HEIGHT + 32;

      component.onPointerDown(pointer(noteX(existing.startStep), startY));
      const released = existing.velocity;
      expect(released).toBe(64);

      component.onPointerUp(pointer(noteX(existing.startStep), startY));
      component.onPointerMove(pointer(noteX(existing.startStep), LANE_BOTTOM));

      expect(existing.velocity).toBe(released);
    });

    it('ignores drags from a different pointer', () => {
      const existing = component.notes[0];

      component.onPointerDown(pointer(noteX(existing.startStep), LANE_TOP, 1));
      component.onPointerMove(pointer(noteX(existing.startStep), LANE_BOTTOM, 2));

      expect(existing.velocity).toBe(125);
    });

    it('leaves notes alone when the lane step has no note', () => {
      const target = cell(20, 81);
      component.onPointerDown(pointer(target.x, GRID_HEIGHT + 10));

      expect(component.selectedNote).toBeNull();
      expect(component.notes.map((note) => note.velocity)).toEqual([100, 90, 110]);
    });
  });

  describe('project binding (selected track)', () => {
    const trackNote = (over: Partial<TrackNote> = {}): TrackNote => ({
      id: 'n1',
      midi: 60,
      step: 0,
      length: 4,
      velocity: 0.8,
      ...over,
    });

    /** Select a track carrying the given notes and flush the resync effect. */
    const bindTrack = (notes: TrackNote[]) => {
      musicManager.tracks.set([
        { id: 't1', name: 'Lead', notes, synthParams: { type: 'saw' } },
      ]);
      musicManager.selectedTrackId.set('t1');
      fixture.detectChanges();
      TestBed.flushEffects();
    };

    it('loads the selected track\u2019s notes into the grid instead of the demo phrase', () => {
      bindTrack([
        trackNote(),
        trackNote({ id: 'n2', midi: 64, step: 4, length: 2, velocity: 0.5 }),
      ]);

      expect(component.notes).toEqual([
        { id: 'n1', pitch: 60, startStep: 0, duration: 4, velocity: 102 },
        { id: 'n2', pitch: 64, startStep: 4, duration: 2, velocity: 64 },
      ]);
    });

    it('writes a created note to the track through the manager', () => {
      bindTrack([]);

      const target = cell(0, 81);
      component.onPointerDown(pointer(target.x, target.y));

      expect(musicManager.addNoteToTrack).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({
          midi: 81,
          step: 0,
          length: 4,
          velocity: 100 / 127,
        })
      );
    });

    it('deletes through the manager', () => {
      bindTrack([trackNote()]);

      const target = cell(0, 60);
      component.onPointerDown(pointer(target.x, target.y));
      component.deleteSelectedNote();

      expect(musicManager.removeNotes).toHaveBeenCalledWith('t1', ['n1']);
    });

    it('commits a velocity gesture as a single edit on release', () => {
      bindTrack([trackNote()]);
      const x = ROW_OFFSET + 2;

      component.onPointerDown(pointer(x, GRID_HEIGHT + 1));
      component.onPointerMove(pointer(x, GRID_HEIGHT + 65));
      expect(musicManager.updateNote).not.toHaveBeenCalled();

      component.onPointerUp(pointer(x, GRID_HEIGHT + 65));
      expect(musicManager.updateNote).toHaveBeenCalledTimes(1);
      expect(musicManager.updateNote).toHaveBeenCalledWith('t1', 'n1', {
        velocity: 0,
      });
    });

    it('auditions a created note through the track\u2019s synth voice', () => {
      bindTrack([]);

      const target = cell(0, 81);
      component.onPointerDown(pointer(target.x, target.y));

      const freq = 440 * Math.pow(2, (81 - 69) / 12);
      expect(musicManager.engine.playSynth).toHaveBeenCalledWith(
        0,
        freq,
        0.5, // 4 steps at 120 BPM
        100 / 127,
        0,
        { type: 'saw' }
      );
    });

    it('auditions an existing note when it is selected', () => {
      bindTrack([trackNote()]);

      const target = cell(0, 60);
      component.onPointerDown(pointer(target.x, target.y));

      const freq = 440 * Math.pow(2, (60 - 69) / 12);
      expect(musicManager.engine.playSynth).toHaveBeenCalledWith(
        0,
        freq,
        0.5,
        102 / 127, // 0.8 rounded through the 1..127 lane scale
        0,
        { type: 'saw' }
      );
    });

    it('resyncs the grid when the track changes under it (undo, comp, other views)', () => {
      bindTrack([trackNote(), trackNote({ id: 'n2', midi: 64, step: 4 })]);

      musicManager.removeNotes('t1', ['n1']); // external edit
      TestBed.flushEffects();

      expect(component.notes.map((note) => note.id)).toEqual(['n2']);
    });

    it('emits the note list on every committed edit', () => {
      const emitted: number[][] = [];
      component.notesChange.subscribe((notes) =>
        emitted.push(notes.map((n) => n.pitch))
      );
      bindTrack([]);

      const target = cell(0, 81);
      component.onPointerDown(pointer(target.x, target.y));
      component.deleteSelectedNote();

      expect(emitted).toEqual([[81], []]);
    });
  });

  describe('transport', () => {
    it('starts the engine on Play and stops it while running', () => {
      component.togglePlayback();
      expect(musicManager.engine.start).toHaveBeenCalled();
      expect(musicManager.engine.stop).not.toHaveBeenCalled();

      musicManager.engine.isPlaying.set(true);
      component.togglePlayback();
      expect(musicManager.engine.stop).toHaveBeenCalled();
    });

    it('paints the playhead at the current step while playing', () => {
      musicManager.engine.isPlaying.set(true);
      musicManager.engine.visualStep.set(4);
      TestBed.flushEffects();

      const x = ROW_OFFSET + 4 * CELL_WIDTH;
      expect(ctx.fillRect).toHaveBeenCalledWith(x - 4, 0, 8, 4);
    });

    it('does not paint a playhead while stopped', () => {
      musicManager.engine.visualStep.set(4);
      TestBed.flushEffects();

      const x = ROW_OFFSET + 4 * CELL_WIDTH;
      expect(ctx.fillRect).not.toHaveBeenCalledWith(x - 4, 0, 8, 4);
    });

    it('hides the playhead past the last visible step', () => {
      musicManager.engine.isPlaying.set(true);
      musicManager.engine.visualStep.set(component.totalSteps + 2);
      TestBed.flushEffects();

      expect(ctx.fillRect).not.toHaveBeenCalledWith(
        ROW_OFFSET + (component.totalSteps + 2) * CELL_WIDTH - 4,
        0,
        8,
        4
      );
    });
  });
});
