import { ComponentFixture, TestBed } from "@angular/core/testing";
import { DrumMachineComponent } from "./drum-machine.component";
import { MusicManagerService } from "../../services/music-manager.service";
import { AudioSessionService } from "../audio-session.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { AiService } from "../../services/ai.service";
import { InstrumentsService } from "../../services/instruments.service";
import { HapticService } from "../../services/haptic.service";
import { signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

import {
  createMockHapticService,
  createMockAudioSession,
  createMockAudioEngine,
} from "../../testing/mocks/hardware.mock";

describe("DrumMachineComponent", () => {
  let component: DrumMachineComponent;
  let fixture: ComponentFixture<DrumMachineComponent>;

  const mockAudioSession = createMockAudioSession();

  const mockMusicManager = {
    tracks: signal<any[]>([
      { id: MusicManagerService.DRUM_TRACK_ID, type: "drum", instrumentId: "synth-kit", name: "Drums", notes: [] },
    ]),
    selectedTrackId: signal<string | null>(MusicManagerService.DRUM_TRACK_ID),
    requestCrossLink: jest.fn(),
    stemAudioCache: new Map<string, AudioBuffer>(),
    currentStep: signal(0),
    drumStepAt: (track: any, step: number, patternStep = step) => patternStep % (track.drumPatternLength ?? 64),
    applyTrackPatch: jest.fn((trackId: string, patch: any) => {
      mockMusicManager.tracks.set(
        mockMusicManager.tracks().map((track: any) =>
          track.id === trackId ? { ...track, ...patch } : track,
        ),
      );
      return true;
    }),
    addNoteToTrack: jest.fn((trackId: string, note: any) => {
      const tracks = mockMusicManager.tracks();
      const track = tracks.find((t) => t.id === trackId);
      if (track) {
        track.notes.push(note);
        mockMusicManager.tracks.set([...tracks]);
      }
    }),
    removeNotes: jest.fn((trackId: string, noteIds: string[]) => {
      const tracks = mockMusicManager.tracks();
      const track = tracks.find((t) => t.id === trackId);
      if (track) {
        track.notes = track.notes.filter((n) => !noteIds.includes(n.id));
        mockMusicManager.tracks.set([...tracks]);
      }
    }),
    updateNote: jest.fn((trackId: string, noteId: string, patch: any) => {
      const tracks = mockMusicManager.tracks();
      const track = tracks.find((t) => t.id === trackId);
      if (track) {
        const note = track.notes.find((n) => n.id === noteId);
        if (note) Object.assign(note, patch);
        mockMusicManager.tracks.set([...tracks]);
      }
    }),
  };

  const mockAudioEngine = createMockAudioEngine();
  const mockHaptic = { ...createMockHapticService(), velocity: jest.fn() };
  const mockInstruments = {
    isSamplePreset: jest.fn(() => false),
    getPresetSample: jest.fn(),
    loadPresetSample: jest.fn(),
  };

  const mockAiService = {
    generateStrategicDecree: jest.fn(),
    roastComponent: jest.fn(),
  };

  beforeEach(async () => {
    mockMusicManager.tracks.set([
      { id: MusicManagerService.DRUM_TRACK_ID, type: "drum", instrumentId: "synth-kit", name: "Drums", notes: [] },
    ]);
    mockMusicManager.selectedTrackId.set(MusicManagerService.DRUM_TRACK_ID);
    mockMusicManager.stemAudioCache.clear();
    mockInstruments.isSamplePreset.mockReturnValue(false);
    await TestBed.configureTestingModule({
      imports: [DrumMachineComponent, CommonModule, FormsModule],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: InstrumentsService, useValue: mockInstruments },
        { provide: HapticService, useValue: mockHaptic },
        { provide: AiService, useValue: mockAiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DrumMachineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("initializes with 8 pads", () => {
    expect(component.pads().length).toBe(8);
  });

  it("selects a pad", () => {
    component.selectPad("pad-38");
    expect(component.selectedPadId()).toBe("pad-38");
  });

  it("toggles a step", () => {
    const padId = component.pads()[0].id;
    component.toggleStep(padId, 0);
    expect(component.getPadStep(padId, 0).active).toBe(true);
  });

  it("edits and auditions the chosen drum channel without changing the other kit", () => {
    const first = mockMusicManager.tracks()[0];
    const second = { id: "second-kit", type: "drum", instrumentId: "synth-kit", name: "Second kit", notes: [] };
    mockMusicManager.tracks.set([first, second]);
    component.selectDrumTrack(second.id);
    const pad = component.pads()[0];
    component.toggleStep(pad.id, 3);
    component.triggerPad(pad);
    component.crossLinkSelectedPad();

    expect(first.notes).toHaveLength(0);
    expect(second.notes).toEqual([expect.objectContaining({ midi: 36, step: 3 })]);
    expect(mockAudioEngine.triggerAttack).toHaveBeenLastCalledWith(second.id, expect.any(Number), 0, 1, expect.any(Number), 1, expect.any(Number), 0, 0, expect.any(Object));
    expect(mockMusicManager.requestCrossLink).toHaveBeenLastCalledWith(expect.objectContaining({ trackId: second.id }));
  });

  it("keeps imported one-shots isolated when switching kits", () => {
    const buffer = { duration: 0.4 } as AudioBuffer;
    mockMusicManager.stemAudioCache.set('first-sample', buffer);
    const first = { ...mockMusicManager.tracks()[0], drumPadSamples: [{ id: 'pad-36', sampleRefId: 'first-sample' }] };
    const second = { id: 'second-kit', type: 'drum', instrumentId: 'synth-kit', name: 'Second kit', notes: [] };
    mockMusicManager.tracks.set([first, second]);
    component.selectDrumTrack(first.id);
    expect(component.pads()[0].sampleBuffer).toBe(buffer);
    component.selectDrumTrack(second.id);
    expect(component.pads()[0].sampleBuffer).toBeUndefined();
    component.selectDrumTrack(first.id);
    expect(component.pads()[0].sampleBuffer).toBe(buffer);
  });

  it("uses the selected kit sample when auditioning a pad", () => {
    const buffer = { duration: 0.4 } as AudioBuffer;
    mockInstruments.isSamplePreset.mockReturnValue(true);
    mockInstruments.getPresetSample.mockReturnValue({ buffer, rate: 1, oneShot: true });
    component.triggerPad(component.pads()[0]);
    expect(mockAudioEngine.triggerSampler).toHaveBeenLastCalledWith(
      MusicManagerService.DRUM_TRACK_ID, buffer, 0, 1, expect.any(Number), 0.4, 1,
    );
  });

  it("stores swing on the selected kit and follows the selected channel", () => {
    const first = mockMusicManager.tracks()[0];
    const second = { id: 'second-kit', type: 'drum', instrumentId: 'synth-kit', name: 'Second kit', notes: [], drumSwing: 0.1 };
    mockMusicManager.tracks.set([first, second]);
    component.setSwing(55);
    expect(mockMusicManager.tracks()[0].drumSwing).toBe(0.55);
    component.selectDrumTrack(second.id);
    expect(component.swingPercent()).toBe(10);
    component.setSwing(25);
    expect(mockMusicManager.tracks()[1].drumSwing).toBe(0.25);
    expect(mockMusicManager.tracks()[0].drumSwing).toBe(0.55);
  });

  it("sets channel cycle length, preserves outside notes, and disables out-of-cycle steps", () => {
    const pad = component.pads()[0];
    component.toggleStep(pad.id, 20);
    component.currentBar.set(1);
    component.setPolymeter(5);
    expect(component.polymeter()).toBe(5);
    expect(component.currentBar()).toBe(0);
    expect(component.getPadStep(pad.id, 20).active).toBe(true);
    component.onStepClick(pad, 5);
    expect(component.getPadStep(pad.id, 5).active).toBe(false);
    fixture.detectChanges();
    const steps = fixture.nativeElement.querySelectorAll('.dm-step-row:first-child .dm-step');
    expect(steps[4].disabled).toBe(false);
    expect(steps[5].disabled).toBe(true);
    const tabs = fixture.nativeElement.querySelectorAll('.dm-bar-tab');
    expect(tabs[1].disabled).toBe(true);
    component.setPolymeter(64);
    expect(component.getPadStep(pad.id, 20).active).toBe(true);
  });

  it("follows the selected channel length and resets an inaccessible bar", () => {
    mockMusicManager.tracks.set([
      mockMusicManager.tracks()[0],
      { id: 'short', type: 'drum', name: 'Short', instrumentId: 'synth-kit', notes: [], drumPatternLength: 7 },
    ]);
    component.currentBar.set(3);
    component.selectDrumTrack('short');
    fixture.detectChanges();
    expect(component.polymeter()).toBe(7);
    expect(component.currentBar()).toBe(0);
    component.setPolymeter(9);
    expect(mockMusicManager.tracks()[0].drumPatternLength).toBeUndefined();
    expect(mockMusicManager.tracks()[1].drumPatternLength).toBe(9);
  });

  it("keeps variation accents inside the cycle and leaves hidden notes untouched", () => {
    component.toggleStep('pad-36', 20);
    component.setPolymeter(5);
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.9);
    try {
      component.generateVariation();
      expect(component.getPadStep('pad-36', 20).active).toBe(true);
      expect(mockMusicManager.tracks()[0].notes.filter((n: any) => n.step !== 20).every((n: any) => n.step < 5)).toBe(true);
      expect(mockMusicManager.tracks()[0].notes.some((n: any) => n.step === 4)).toBe(true);
    } finally { random.mockRestore(); }
  });

  it("edits the visible bar by tap and drag for velocity and probability", () => {
    component.currentBar.set(2);
    component.toggleStep('pad-36', 34);
    component.toggleStep('pad-36', 35);
    const strip = fixture.nativeElement.querySelector('.dm-vel-strip') as HTMLElement;
    jest.spyOn(strip, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 160, height: 100 } as DOMRect);
    const pointer = (x: number, y: number) => ({ currentTarget: strip, clientX: x, clientY: y, button: 0, pointerId: 1 }) as PointerEvent;
    component.onGraphPointerDown(pointer(35, 70));
    component.onGraphPointerMove(pointer(45, 45));
    component.onGraphPointerUp(pointer(45, 45));
    expect(component.getPadStep('pad-36', 34).velocity).toBe(0.5);
    expect(component.getPadStep('pad-36', 35).velocity).toBe(0.75);
    component.graphTarget.set('probability');
    component.onGraphPointerDown(pointer(35, 100));
    expect(component.getPadStep('pad-36', 34).probability).toBeCloseTo(0.2);
    expect(component.selectedPadSteps()).toHaveLength(16);
  });

  it("maps step taps to the selected bar even in high-density mode", () => {
    component.currentBar.set(2);
    component.padsCollapsed.set(true);
    component.inspectorCollapsed.set(true);
    component.onStepClick(component.pads()[0], 3);
    expect(component.getPadStep('pad-36', 35).active).toBe(true);
  });

  it("only opens step settings for an active hit and stores its ratchet", () => {
    const pad = component.pads()[0];
    component.openStepSheet(pad, 1);
    expect(component.stepSheetOpen()).toBe(false);
    component.toggleStep(pad.id, 1);
    component.openStepSheet(pad, 1);
    expect(component.stepSheetOpen()).toBe(true);
    component.updateSelectedStepRatchet(3);
    expect(component.getPadStep(pad.id, 1).ratchet).toBe(3);
  });

  it("handles collapsibility correctly", () => {
    expect(component.padsCollapsed()).toBe(false);
    expect(component.inspectorCollapsed()).toBe(false);
    expect(component.highDensity()).toBe(false);

    component.padsCollapsed.set(true);
    component.inspectorCollapsed.set(true);
    expect(component.highDensity()).toBe(true);
  });

  it("clearCurrentPad removes only notes for selected pad", () => {
    const pad1 = component.pads()[0];
    const pad2 = component.pads()[1];
    component.toggleStep(pad1.id, 0);
    component.toggleStep(pad2.id, 1);

    component.selectPad(pad1.id);
    component.clearCurrentPad();

    expect(component.getPadStep(pad1.id, 0).active).toBe(false);
    expect(component.getPadStep(pad2.id, 1).active).toBe(true);
  });

  it("doublePattern copies first 32 steps to last 32", () => {
    const padId = component.pads()[0].id;
    component.toggleStep(padId, 0);
    component.doublePattern();

    expect(component.getPadStep(padId, 32).active).toBe(true);
  });

  it("updates tempo and toggles metronome from the compact transport controls", () => {
    component.nudgeTempo(4);
    expect(mockAudioEngine.tempo()).toBe(124);

    component.toggleMetronome();
    expect(mockAudioEngine.resume).toHaveBeenCalled();
    expect(mockAudioEngine.toggleMetronome).toHaveBeenCalled();
  });

  it("generateEuclidean creates patterns", () => {
    const padId = component.pads()[0].id;
    component.generateEuclidean(4, 16);
    const steps = Array.from(
      { length: 16 },
      (_, i) => component.getPadStep(padId, i).active,
    );
    const activeCount = steps.filter((s) => s).length;
    expect(activeCount).toBe(4);
  });

  describe("Stage 2.1 touch performance", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("auditions a pad on pointerdown at full velocity for neutral pressure", () => {
      const pad = component.pads()[0];
      component.onPadPress(pad, { pressure: 0.5 } as PointerEvent);

      expect(component.selectedPadId()).toBe(pad.id);
      expect(mockAudioEngine.triggerAttack).toHaveBeenCalledWith(
        MusicManagerService.DRUM_TRACK_ID,
        expect.any(Number),
        0,
        1,
        expect.any(Number),
        1,
        expect.any(Number),
        0,
        0,
        expect.any(Object),
      );
      expect(mockHaptic.drumHit).toHaveBeenCalledWith(1);
    });

    it("maps soft force-touch pressure to a softer strike velocity", () => {
      const pad = component.pads()[0];
      component.onPadPress(pad, { pressure: 0.25 } as PointerEvent);

      expect(mockHaptic.drumHit).toHaveBeenCalledWith(0.5);
      expect(mockAudioEngine.triggerAttack.mock.calls[0][3]).toBe(0.5);
    });

    it("does not double-audition when a pointer click follows pointerdown", () => {
      const pad = component.pads()[0];
      component.onPadClick(pad, { detail: 1 } as MouseEvent);

      expect(component.selectedPadId()).toBe(pad.id);
      expect(mockAudioEngine.triggerAttack).not.toHaveBeenCalled();
      expect(mockHaptic.drumHit).not.toHaveBeenCalled();
    });

    it("auditions a pad when activated from the keyboard (click detail 0)", () => {
      const pad = component.pads()[0];
      component.onPadClick(pad, { detail: 0 } as MouseEvent);

      expect(mockAudioEngine.triggerAttack).toHaveBeenCalled();
      expect(mockHaptic.drumHit).toHaveBeenCalledWith(1);
    });
  });
  it("imports a one-shot into the selected pad and reports its quality", async () => {
    const pad = component.pads()[0];
    const sample = {
      duration: 0.4,
      sampleRate: 48000,
      numberOfChannels: 2,
      getChannelData: jest.fn(() => new Float32Array(8)),
    } as unknown as AudioBuffer;
    (mockAudioEngine.ctx as any).decodeAudioData = jest
      .fn()
      .mockResolvedValue(sample);
    const input = {
      value: "kick.wav",
      files: [
        {
          name: "kick.wav",
          size: 1024,
          arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
        },
      ],
    } as any;

    await component.onSampleSelected({ target: input } as any);

    const updated = component.pads().find((candidate) => candidate.id === pad.id)!;
    expect(updated.sampleBuffer).toBe(sample);
    expect(updated.sampleRefId).toMatch(/^drum-sample-pad-36-/);
    expect(updated.sampleName).toBe("kick.wav");
    expect(updated.sampleMeta).toEqual({
      sampleRate: 48000,
      channels: 2,
      duration: 0.4,
      quality: "STUDIO",
    });
    expect(mockMusicManager.stemAudioCache.get(updated.sampleRefId!)).toBe(
      sample,
    );
    expect(
      (mockMusicManager.tracks()[0] as any).drumPadSamples,
    ).toEqual([
      expect.objectContaining({ id: pad.id, sampleRefId: updated.sampleRefId }),
    ]);
    expect(input.value).toBe("");
  });

  it("clears an imported one-shot back to the pad synth", () => {
    const pad = component.pads()[0];
    component.pads.update((pads) =>
      pads.map((candidate) =>
        candidate.id === pad.id
          ? {
              ...candidate,
              sampleBuffer: { duration: 1 } as AudioBuffer,
              sampleName: "kick.wav",
              sampleMeta: {
                sampleRate: 48000,
                channels: 1,
                duration: 1,
                quality: "STUDIO" as const,
              },
            }
          : candidate,
      ),
    );

    component.clearSelectedPadSample();

    const updated = component.pads().find((candidate) => candidate.id === pad.id)!;
    expect(updated.sampleBuffer).toBeUndefined();
    expect(updated.sampleRefId).toBeUndefined();
    expect(updated.sampleName).toBeUndefined();
    expect(updated.sampleMeta).toBeUndefined();
  });

});
