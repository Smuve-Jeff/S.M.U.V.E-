import { ComponentFixture, TestBed } from "@angular/core/testing";
import { PerformanceGridComponent } from "./performance-grid.component";
import { MusicManagerService } from "../../services/music-manager.service";
import { AudioSessionService } from "../audio-session.service";
import { HapticService } from "../../services/haptic.service";
import { StudioVisualSchedulerService } from "../shared/studio-visual-scheduler.service";
import { signal } from "@angular/core";

describe("PerformanceGridComponent", () => {
  let fixture: ComponentFixture<PerformanceGridComponent>;
  let component: PerformanceGridComponent;

  const capturePatternSlot = jest.fn();
  const recallPatternSlot = jest.fn();
  const light = jest.fn();
  const medium = jest.fn();

  const filledSlot = {
    id: "slot-0",
    name: "Scene 1",
    versions: [{ notes: [{ midi: 60 }], steps: [true, false] }],
  };
  const emptySlot = {
    id: "slot-1",
    name: "Scene 2",
    versions: [{ notes: [], steps: [false, false] }],
  };

  const tracksSignal = signal([
    {
      id: "t1",
      name: "Bass",
      color: "#00e5ff",
      activePatternSlotId: "slot-0",
      patternSlots: [filledSlot, emptySlot],
    },
  ]);

  const analyser = {
    fftSize: 0,
    frequencyBinCount: 4,
    connect: jest.fn(),
    disconnect: jest.fn(),
    getByteFrequencyData: (data: Uint8Array) => data.fill(255),
  };

  const mockMusicManager = {
    tracks: tracksSignal,
    capturePatternSlot,
    recallPatternSlot,
  };

  const mockAudioSession = {
    engine: {
      ctx: { createAnalyser: () => analyser },
      getTrackOutput: () => ({ connect: jest.fn() }),
    },
  };

  const schedulerStops: jest.Mock[] = [];
  const mockScheduler = {
    register: jest.fn((callback: () => void, options?: { immediate?: boolean }) => {
      if (options?.immediate !== false) callback();
      const stop = jest.fn();
      schedulerStops.push(stop);
      return stop;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    schedulerStops.length = 0;
    analyser.connect.mockClear();
    analyser.disconnect.mockClear();

    await TestBed.configureTestingModule({
      imports: [PerformanceGridComponent],
      providers: [
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: HapticService, useValue: { light, medium } },
        { provide: StudioVisualSchedulerService, useValue: mockScheduler },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerformanceGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders one column per track and eight scene slots per track", () => {
    const columns = fixture.nativeElement.querySelectorAll(".grid-column");
    expect(columns.length).toBe(1);
    expect(columns[0].querySelectorAll("button.clip-cell-v42").length).toBe(8);
    expect(columns[0].textContent).toContain("Bass");
  });

  it("reports slot content instead of assuming every slot is filled", () => {
    const track = tracksSignal()[0] as any;
    expect(component.hasContent(track, 0)).toBe(true);
    expect(component.hasContent(track, 1)).toBe(false);
    expect(component.hasContent(track, 7)).toBe(false);
  });

  it("captures the current pattern when an empty scene is tapped", () => {
    component.toggleClip("t1", 1);
    expect(capturePatternSlot).toHaveBeenCalledWith("t1", "slot-1", "Scene 2");
    expect(recallPatternSlot).not.toHaveBeenCalled();
  });

  it("launches the captured pattern when a filled scene is tapped", () => {
    component.toggleClip("t1", 0);
    expect(recallPatternSlot).toHaveBeenCalledWith("t1", "slot-0");
    expect(capturePatternSlot).not.toHaveBeenCalled();
  });

  it("reports the active scene from the track's slot id", () => {
    const track = tracksSignal()[0] as any;
    expect(component.isActive(track, 0)).toBe(true);
    expect(component.isActive(track, 1)).toBe(false);
  });

  it("falls back to a slot label when the scene was never captured", () => {
    const track = tracksSignal()[0] as any;
    expect(component.slotName(track, 0)).toBe("Scene 1");
    expect(component.slotName(track, 3)).toBe("Slot 4");
  });

  it("exposes a meter level per track from the registered visual task", () => {
    expect(component.getTrackLevel("t1")).toBeCloseTo(1);
    expect(component.getTrackLevel("missing")).toBe(0);
  });

  it("recaptures the scene on a long press and does not also launch it", () => {
    jest.useFakeTimers();
    component.onSlotPointerDown(tracksSignal()[0] as any, 0);
    jest.advanceTimersByTime(500);

    expect(medium).toHaveBeenCalled();
    expect(capturePatternSlot).toHaveBeenCalledWith("t1", "slot-0", "Scene 1");

    // The click that follows the long press must be swallowed.
    component.toggleClip("t1", 0);
    expect(recallPatternSlot).not.toHaveBeenCalled();

    // ...but the slot must not stay dead: once the suppression window has
    // passed (or on any fresh pointer press) it launches again.
    jest.advanceTimersByTime(1000);
    component.toggleClip("t1", 0);
    expect(recallPatternSlot).toHaveBeenCalledWith("t1", "slot-0");
  });

  it("swallows a release click that arrives long after a slow hold", () => {
    jest.useFakeTimers();
    component.onSlotPointerDown(tracksSignal()[0] as any, 0);
    jest.advanceTimersByTime(500);
    expect(capturePatternSlot).toHaveBeenCalledWith("t1", "slot-0", "Scene 1");

    // The artist keeps holding: the press-based window is long gone by now.
    jest.advanceTimersByTime(900);
    component.onSlotPointerUp();

    // ...and the platform's release click only lands on a busy device.
    jest.advanceTimersByTime(600);
    component.toggleClip("t1", 0);
    expect(recallPatternSlot).not.toHaveBeenCalled();

    // The re-armed window still expires, so the slot cannot stay dead.
    jest.advanceTimersByTime(200);
    component.toggleClip("t1", 0);
    expect(recallPatternSlot).toHaveBeenCalledWith("t1", "slot-0");
  });

  it("launches on a plain tap that never long-pressed", () => {
    jest.useFakeTimers();
    component.onSlotPointerDown(tracksSignal()[0] as any, 0);
    component.onSlotPointerUp();
    component.toggleClip("t1", 0);
    expect(recallPatternSlot).toHaveBeenCalledWith("t1", "slot-0");
    expect(capturePatternSlot).not.toHaveBeenCalled();
  });

  it("cancels a pending long press when the pointer lifts early", () => {
    jest.useFakeTimers();
    component.onSlotPointerDown(tracksSignal()[0] as any, 0);
    component.onSlotPointerUp();
    jest.advanceTimersByTime(1000);
    expect(capturePatternSlot).not.toHaveBeenCalled();
  });

  it("wires pointerdown and pointerup on the DOM slot buttons for touch long-press", () => {
    jest.useFakeTimers();
    const firstSlot: HTMLButtonElement =
      fixture.nativeElement.querySelector("button.clip-cell-v42");
    firstSlot.dispatchEvent(new Event("pointerdown"));
    jest.advanceTimersByTime(500);
    expect(capturePatternSlot).toHaveBeenCalledWith("t1", "slot-0", "Scene 1");
  });

  it("launches the selected row across tracks with content and ignores null selection", () => {
    component.launchRow();
    expect(recallPatternSlot).not.toHaveBeenCalled();

    component.selectedRow.set(0);
    component.launchRow();
    expect(recallPatternSlot).toHaveBeenCalledWith("t1", "slot-0");
    expect(component.selectedRow()).toBeNull();
  });

  it("tears down its meter tap and visual task on destroy", () => {
    component.ngOnDestroy();
    expect(schedulerStops[0]).toHaveBeenCalled();
    expect(analyser.disconnect).toHaveBeenCalled();
  });
});
