import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MixerComponent } from "./mixer.component";
import { MusicManagerService } from "../../services/music-manager.service";
import { AudioSessionService } from "../audio-session.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { RecordingStatusService } from "../recording-status.service";
import { signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { KnobComponent } from "../shared/knob/knob.component";

describe("MixerComponent", () => {
  let component: MixerComponent;
  let fixture: ComponentFixture<MixerComponent>;

  const connectSidechain = jest.fn();
  const disconnectSidechain = jest.fn();

  const mockAudioSession = {
    isPlaying: signal(false),
    isRecording: signal(false),
    masterVolume: signal(100),
    togglePlay: jest.fn(),
    updateMasterVolume: jest.fn(),
    engine: {
      ctx: {
        createAnalyser: () => ({
          fftSize: 0,
          connect: () => {},
          frequencyBinCount: 0,
          getByteFrequencyData: () => {},
        }),
      },
      outputLufs: signal(-14),
      /** Real L/R correlation from the engine's stereo metering tap. */
      outputCorrelation: signal(0),
      getTrackOutput: () => ({ connect: () => {} }),
      connectSidechain,
      disconnectSidechain,
    },
  };

  const mockMusicManager = {
    tracks: signal([
      { id: "1", name: "Track 1", gain: 1, pan: 0, mute: false, solo: false },
      { id: "2", name: "Track 2", gain: 1, pan: 0, mute: false, solo: false },
    ]),
    selectedTrackId: signal("1"),
    engine: {
      updateTrack: jest.fn(),
      applyProductionParameter: jest.fn(),
      setVcaMultiplier: jest.fn(),
      connectSidechain,
      disconnectSidechain,
    },
    updateVolume: jest.fn(),
    updateTrackPan: jest.fn(),
    updateSend: jest.fn(),
    toggleMute: jest.fn(),
    toggleSolo: jest.fn(),
    removeTrack: jest.fn(),
  };

  const recordingStatusMock = {
    armedTrackIds: signal(new Set<string>()),
    armTrack: jest.fn(),
    disarmTrack: jest.fn(),
    toggleArmTrack: jest.fn(),
    isTrackArmed: jest.fn((id: string) =>
      (recordingStatusMock.armedTrackIds() as Set<string>).has(id),
    ),
    setRecordingSource: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [MixerComponent, CommonModule, FormsModule, KnobComponent],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: RecordingStatusService, useValue: recordingStatusMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MixerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it('reads the live phase correlation from the engine instead of faking it', () => {
    // It used to be a permanent "UNAVAILABLE" with a hard-coded 0.
    expect(component.phaseCorrelationAvailable).toBe(true);
    mockAudioSession.engine.outputCorrelation.set(-0.4);
    expect(component.phaseCorrelation()).toBe(-0.4);
    // -0.4 reads as out of phase, with the red classifier colour.
    expect(component.phaseCorrelationLabel()).toBe("OUT OF PHASE");
    expect(component.phaseCorrelationColor()).toBe("#ff3d6e");
  });

  it('shows each AUX send as a real dB readout', () => {
    // The Sends view has always claimed dB readouts; now it has them.
    expect(component.sendDb(1)).toBe("0.0 dB");
    expect(component.sendDb(0.5)).toBe("−6.0 dB");
    expect(component.sendDb(0)).toBe("−∞ dB");
    expect(component.sendDb(1.5)).toBe("+3.5 dB");
  });

  it('reuses per-track meter buffers across visual updates', () => {
    (component as any).updateMeters();
    const first = (component as any).analyserBuffers.get('1');
    (component as any).updateMeters();
    expect((component as any).analyserBuffers.get('1')).toBe(first);
  });

  it('ends an in-flight fader gesture on pointer cancellation', () => {
    component.startFaderDrag({ clientY: 100 } as PointerEvent, '1');
    window.dispatchEvent(new Event('pointercancel'));
    mockMusicManager.updateVolume.mockClear();
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 50 }));
    expect(mockMusicManager.updateVolume).not.toHaveBeenCalled();
    expect((component as any).dragCleanup).toBeNull();
  });

  it('keeps fader movement continuous when precision mode engages mid-drag', () => {
    // Control the clock so pointer velocity is deterministic: each frame
    // advances 100ms, which makes 40px "fast" (0.4 px/ms) and 2px "slow"
    // (0.02 px/ms, below the 0.3 threshold → precision mode).
    let now = 1_000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      // Track 1 starts at unity (100%); no rect → keep the current value.
      component.startFaderDrag({ clientY: 300 } as PointerEvent, '1');
      // Fast frame: 40px up at 1/200 per px → +0.2.
      now += 100;
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientY: 260, bubbles: true }),
      );
      const afterFast = mockMusicManager.updateVolume.mock.calls.at(-1)![1];
      expect(afterFast).toBeCloseTo(1.2, 5);
      // Slow frame: 2px up at 1/600 per px → +0.00333. The old code rescaled
      // the whole 40px accumulated delta by 1/600 and dropped the value to
      // ~0.93 (a visible jump); delta-based movement must keep rising.
      now += 100;
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientY: 258, bubbles: true }),
      );
      const afterSlow = mockMusicManager.updateVolume.mock.calls.at(-1)![1];
      expect(afterSlow).toBeCloseTo(1.2 + 2 / 600, 4);
      expect(afterSlow).toBeGreaterThan(afterFast);
      window.dispatchEvent(new Event('pointerup'));
    } finally {
      clock.mockRestore();
    }
  });

  it('moves the pan from the pressed position instead of snapping back', () => {
    // Press on the right half: pan is set to +1 immediately...
    component.onPanPointerDown(
      {
        clientX: 60,
        stopPropagation: jest.fn(),
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 40 }),
        },
      } as any,
      { id: '1', name: 'Track 1', pan: -0.5 } as any,
    );
    expect(mockMusicManager.updateTrackPan).toHaveBeenLastCalledWith('1', 100);
    // ...and the first move continues from +1, not from the stale -0.5.
    // 10px left across the (min 80px) sweep is -0.25 pan → +75, whereas the
    // old stale-anchor code jumped to -70.
    window.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 50, bubbles: true }),
    );
    const pan = mockMusicManager.updateTrackPan.mock.calls.at(-1)![1];
    expect(pan).toBeCloseTo(75, 5);
    window.dispatchEvent(new Event('pointerup'));
  });

  it('restores the pre-mute master level when unmuting', () => {
    mockAudioSession.masterVolume.set(63);
    component.toggleMasterMute();
    expect(mockAudioSession.updateMasterVolume).toHaveBeenLastCalledWith(0);
    expect(component.masterMuted()).toBe(true);
    component.toggleMasterMute();
    expect(mockAudioSession.updateMasterVolume).toHaveBeenLastCalledWith(63);
    expect(component.masterMuted()).toBe(false);
  });

  it('supports keyboard control on the track and master faders', () => {
    const key = (k: string) =>
      ({ key: k, shiftKey: false, preventDefault: jest.fn() }) as any;
    component.onFaderKeydown(key('ArrowUp'), '1');
    expect(mockMusicManager.updateVolume).toHaveBeenLastCalledWith('1', 1.01);
    component.onFaderKeydown(key('End'), '1');
    expect(mockMusicManager.updateVolume).toHaveBeenLastCalledWith('1', 1.5);

    mockAudioSession.masterVolume.set(50);
    component.onMasterFaderKeydown(key('ArrowDown'));
    expect(mockAudioSession.updateMasterVolume).toHaveBeenLastCalledWith(49);
  });

  it('does not solo a strip when the touch turns into a bank scroll', () => {
    jest.useFakeTimers();
    try {
      component.onStripTouchStart(
        { touches: [{ clientX: 10, clientY: 10 }] } as any,
        '1',
      );
      component.onStripTouchMove({
        touches: [{ clientX: 60, clientY: 12 }],
      } as any);
      jest.advanceTimersByTime(600);
      expect(mockMusicManager.toggleSolo).not.toHaveBeenCalled();

      // A stationary hold still solos.
      component.onStripTouchStart(
        { touches: [{ clientX: 10, clientY: 10 }] } as any,
        '1',
      );
      jest.advanceTimersByTime(600);
      expect(mockMusicManager.toggleSolo).toHaveBeenCalledWith('1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('clamps sends to the range MusicManagerService actually stores', () => {
    component.updateSend('1', 'A', 150);
    expect(mockMusicManager.updateSend).toHaveBeenLastCalledWith('1', 'A', 1);
  });

  it("updates track volume", () => {
    component.updateTrackVolume("1", 120);
    expect(mockMusicManager.engine.updateTrack).toHaveBeenCalledWith("1", {
      gain: 1.2,
    });
  });

  it("removes track", () => {
    window.confirm = jest.fn().mockReturnValue(true);
    component.removeTrack("1", new MouseEvent("click") as any);
    expect(mockMusicManager.removeTrack).toHaveBeenCalledWith("1");
  });

  it("arms a track through RecordingStatusService (single source of truth)", () => {
    component.toggleArmTrack("1");
    expect(recordingStatusMock.armTrack).toHaveBeenCalledWith("1");
    // Toggling must NOT reach for a parallel per-track flag: the track list
    // itself stays untouched (the old code rewrote the whole array here).
    expect(mockMusicManager.tracks()).toHaveLength(2);

    recordingStatusMock.armedTrackIds.set(new Set(["1"]));
    fixture.detectChanges();
    expect(component.isArmed("1")).toBe(true);
    expect(component.isArmed("2")).toBe(false);

    component.toggleArmTrack("1");
    expect(recordingStatusMock.disarmTrack).toHaveBeenCalledWith("1");
  });

  it("wires the sidechain chip into the engine routing (not just UI)", () => {
    component.toggleSidechain("1", "2");
    expect(connectSidechain).toHaveBeenCalledWith("2", "1");
    expect(component.hasSidechain("1")).toBe(true);
    expect(component.sidechainSourceNameFor("1")).toBe("Track 2");

    // Selecting the same source again clears it.
    component.toggleSidechain("1", "2");
    expect(disconnectSidechain).toHaveBeenCalledWith("2", "1");
    expect(component.hasSidechain("1")).toBe(false);

    // Switching sources tears down the old pair and connects the new one.
    component.toggleSidechain("1", "2");
    component.toggleSidechain("1", null);
    expect(disconnectSidechain).toHaveBeenLastCalledWith("2", "1");
  });

  it("reports sidechain candidates excluding the target track itself", () => {
    const candidates = component.sidechainCandidates("2");
    expect(candidates.map((t) => t.id)).toEqual(["1"]);
  });

  it("starts on the Strips console view", () => {
    expect(component.mixerView()).toBe("strips");
    const shell: HTMLElement =
      fixture.nativeElement.querySelector(".mix-shell");
    expect(shell.classList.contains("mix-view-strips")).toBe(true);
    expect(shell.classList.contains("mix-view-sends")).toBe(false);
    expect(shell.classList.contains("mix-view-routing")).toBe(false);
  });

  it("drives one send surface at a time from the segmented control", () => {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll(
        ".mix-segmented button",
      ) as NodeListOf<HTMLButtonElement>,
    );
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([
      "Strips",
      "Sends",
      "Routing",
    ]);
    // The control used to be decorative: only Strips was ever active.
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");

    buttons[1].click();
    fixture.detectChanges();
    expect(component.mixerView()).toBe("sends");
    const shell: HTMLElement =
      fixture.nativeElement.querySelector(".mix-shell");
    expect(shell.classList.contains("mix-view-sends")).toBe(true);
    expect(shell.classList.contains("mix-view-strips")).toBe(false);
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");

    buttons[2].click();
    fixture.detectChanges();
    expect(component.mixerView()).toBe("routing");
    expect(shell.classList.contains("mix-view-routing")).toBe(true);
    expect(buttons[2].getAttribute("aria-pressed")).toBe("true");
  });

  it("does not re-emit haptics when the console view is unchanged", () => {
    component.setMixerView("strips");
    expect(component.mixerView()).toBe("strips");
    component.setMixerView("routing");
    expect(component.mixerView()).toBe("routing");
  });

  it("counts the tracks that have a sidechain feed for the routing view", () => {
    expect(component.sidechainCount()).toBe(0);
    component.toggleSidechain("1", "2");
    fixture.detectChanges();
    expect(component.sidechainCount()).toBe(1);
    component.toggleSidechain("1", null);
    fixture.detectChanges();
    expect(component.sidechainCount()).toBe(0);
  });
});
