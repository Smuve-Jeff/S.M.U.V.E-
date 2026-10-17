import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { ChannelRackComponent } from "./channel-rack.component";
import { MusicManagerService } from "../../services/music-manager.service";

describe("ChannelRackComponent step lane", () => {
  let component: ChannelRackComponent;
  let fixture: ComponentFixture<ChannelRackComponent>;
  let addNote: jest.Mock;
  let removeNotes: jest.Mock;
  let updateSynthParams: jest.Mock;
  let selectedTrackId: ReturnType<typeof signal<string | null>>;

  const makeTrack = (overrides: any = {}) => ({
    id: "track-1",
    name: "Lead",
    type: "midi",
    instrumentId: "grand-piano",
    muted: false,
    soloed: false,
    volume: 0.8,
    gain: 0.8,
    pan: 0,
    clips: [],
    notes: [] as any[],
    steps: new Array(64).fill(false),
    fxSlots: [],
    sendA: 0,
    sendB: 0,
    effects: [],
    patternSlots: [],
    activePatternSlotId: null,
    ...overrides,
  });

  const tracks = signal<any[]>([]);
  const visualStep = signal(0);
  const isPlaying = signal(false);

  beforeEach(async () => {
    addNote = jest.fn();
    removeNotes = jest.fn();
    updateSynthParams = jest.fn();
    selectedTrackId = signal<string | null>("track-1");
    tracks.set([makeTrack({ synthParams: { type: "sawtooth" } })]);

    await TestBed.configureTestingModule({
      imports: [ChannelRackComponent],
      providers: [
        {
          provide: MusicManagerService,
          useValue: {
            tracks,
            selectedTrackId,
            engine: { visualStep, isPlaying },
            removeTrack: jest.fn(),
            ensureTrack: jest.fn(),
            setInstrument: jest.fn(),
            toggleMute: jest.fn(),
            toggleSolo: jest.fn(),
            updateVolume: jest.fn(),
            updateTrackPan: jest.fn(),
            updateSynthParams,
            addTrack: jest.fn(),
            addNoteToTrack: addNote,
            removeNotes,
          },
        },
      ],
    })
      .overrideComponent(ChannelRackComponent, {
        set: { template: "<div></div>" },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChannelRackComponent);
    component = fixture.componentInstance;
  });

  it("creates with the window on bar 1 when stopped", () => {
    expect(component.windowStart()).toBe(0);
  });

  it("adds an audible note at the cell step with the modal track pitch", () => {
    const track = makeTrack({
      notes: [
        { id: "n1", midi: 48, step: 0, length: 1, velocity: 0.8 },
        { id: "n2", midi: 48, step: 2, length: 1, velocity: 0.8 },
        { id: "n3", midi: 72, step: 4, length: 1, velocity: 0.8 },
      ],
    });
    tracks.set([track]);

    component.toggleStepCell(track, 6);
    expect(addNote).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({ step: 6, midi: 48 }),
    );
  });

  it("falls back to middle C when the track has no notes yet", () => {
    const track = makeTrack();
    expect(component.pitchForNewNote(track)).toBe(60);
  });

  it("removes every note on a cell that is already lit", () => {
    const track = makeTrack({
      notes: [
        { id: "n1", midi: 60, step: 0, length: 1, velocity: 0.8 },
        { id: "n2", midi: 64, step: 0, length: 1, velocity: 0.8 },
      ],
    });
    tracks.set([track]);

    component.toggleStepCell(track, 0);
    expect(removeNotes).toHaveBeenCalledWith("track-1", ["n1", "n2"]);
    expect(addNote).not.toHaveBeenCalled();
  });

  it("lights a cell only when an audible note starts there", () => {
    const track = makeTrack({
      notes: [{ id: "n1", midi: 60, step: 3.5, length: 1, velocity: 0.8 }],
    });
    expect(component.cellLit(track, 3)).toBe(true);
    expect(component.cellLit(track, 4)).toBe(false);
  });

  it("pages the editing window to later bars when stopped", () => {
    component.nudgeBar(1);
    expect(component.stepBar()).toBe(1);
    expect(component.windowStart()).toBe(16);

    component.setBar(tracks()[0], 3);
    expect(component.windowStart()).toBe(48);
  });

  it("rides the playhead while playing and returns to the paged bar on stop", () => {
    component.stepBar.set(1);
    isPlaying.set(true);
    visualStep.set(40);
    expect(component.windowStart()).toBe(32);

    isPlaying.set(false);
    visualStep.set(40);
    expect(component.windowStart()).toBe(16);
  });

  it("grows bar count to cover composed notes (min four bars)", () => {
    expect(component.barCount(tracks()[0])).toBe(4);
    tracks.set([
      makeTrack({
        notes: [{ id: "n1", midi: 60, step: 70, length: 1, velocity: 0.8 }],
      }),
    ]);
    expect(component.barCount(tracks()[0])).toBe(5);
  });

  it("supports drag-painting steps across a channel row (add & erase)", () => {
    const track = makeTrack({
      notes: [{ id: "n1", midi: 60, step: 0, length: 1, velocity: 0.8 }],
    });
    tracks.set([track]);

    // Start painting on an empty cell (step 1) -> adds note, then slide to step 2
    component.startStepPaint(track, 1);
    expect(addNote).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({ step: 1, midi: 60 }),
    );
    component.continueStepPaint(track, 2);
    expect(addNote).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({ step: 2, midi: 60 }),
    );
    component.endStepPaint();

    // Start painting on a lit cell (step 0) -> removes note
    removeNotes.mockClear();
    component.startStepPaint(track, 0);
    expect(removeNotes).toHaveBeenCalledWith("track-1", ["n1"]);
    component.endStepPaint();
  });

  /** Minimal lane DOM: a grid tagged with its track id holding indexed cells. */
  const buildLane = (trackId: string, count: number) => {
    const lane = document.createElement("div");
    lane.setAttribute("data-track-id", trackId);
    const cells: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
      const cell = document.createElement("div");
      cell.setAttribute("data-step-index", String(i));
      lane.appendChild(cell);
      cells.push(cell);
    }
    document.body.appendChild(lane);
    return { lane, cells };
  };

  /** jsdom has no layout, so hit-testing is stubbed the way the browser would answer. */
  const stubHit = (element: Element | null) => {
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      writable: true,
      value: jest.fn(() => element),
    });
  };

  it("slides a touch drag to the cell under the finger, not the pointer-captured cell", () => {
    const track = makeTrack();
    tracks.set([track]);

    const { lane, cells } = buildLane("track-1", 4);
    // Touch pointers keep implicit capture on the cell that was pressed, so the
    // move event still targets step 1 while the finger is over step 2.
    stubHit(cells[2]);
    const move = {
      target: cells[0],
      clientX: 12,
      clientY: 34,
    } as unknown as PointerEvent;

    component.startStepPaint(track, 1);
    expect(addNote).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({ step: 1 }),
    );

    addNote.mockClear();
    component.onStepPaintMove(track, move);
    expect(addNote).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({ step: 2 }),
    );

    // Repeat moves inside one cell must not double-toggle it.
    addNote.mockClear();
    component.onStepPaintMove(track, move);
    expect(addNote).not.toHaveBeenCalled();

    component.endStepPaint();
    lane.remove();
  });

  it("ignores slide moves that leave the lane, cross channels, or arrive after the gesture", () => {
    const track = makeTrack();
    tracks.set([track]);

    const { lane } = buildLane("track-1", 4);
    const otherLane = buildLane("track-2", 4);
    const crossChannel = {
      target: otherLane.cells[3],
      clientX: 5,
      clientY: 5,
    } as unknown as PointerEvent;

    component.startStepPaint(track, 1);
    addNote.mockClear();

    // The finger has slid onto another channel's lane.
    stubHit(otherLane.cells[3]);
    component.onStepPaintMove(track, crossChannel);
    expect(addNote).not.toHaveBeenCalled();

    // Off every lane: the only remaining hint is the captured cell, which
    // belongs to the other channel and must not paint this one.
    stubHit(null);
    component.onStepPaintMove(track, crossChannel);
    expect(addNote).not.toHaveBeenCalled();

    component.endStepPaint();
    stubHit(otherLane.cells[1]);
    component.onStepPaintMove(track, {
      target: otherLane.cells[1],
      clientX: 6,
      clientY: 6,
    } as unknown as PointerEvent);
    expect(addNote).not.toHaveBeenCalled();

    lane.remove();
    otherLane.lane.remove();
  });

  it("updates per-track LFO parameters through MusicManagerService.updateSynthParams", () => {
    component.updateLfoParam("wave", "square", "track-1");
    expect(updateSynthParams).toHaveBeenCalledWith("track-1", {
      lfo: expect.objectContaining({
        wave: "square",
        target: "cutoff",
      }),
    });

    component.updateLfoParam("target", "pitch", "track-1");
    expect(component.lfoTarget()).toBe("pitch");
    expect(updateSynthParams).toHaveBeenLastCalledWith("track-1", {
      lfo: expect.objectContaining({ target: "pitch" }),
    });

    component.updateLfoParam("rate", "12.5", "track-1");
    expect(updateSynthParams).toHaveBeenLastCalledWith("track-1", {
      lfo: expect.objectContaining({ rate: 12.5 }),
    });
  });
});
