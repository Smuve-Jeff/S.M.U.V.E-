import { ComponentFixture, TestBed } from '@angular/core/testing';

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

    await TestBed.configureTestingModule({
      imports: [PianoRollComponent],
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
});
