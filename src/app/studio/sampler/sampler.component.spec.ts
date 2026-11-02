import { ComponentFixture, TestBed } from "@angular/core/testing";
import { SamplerComponent } from "./sampler.component";
import { AudioEngineService } from "../../services/audio-engine.service";
import { FileLoaderService } from "../../services/file-loader.service";
import { HapticService } from "../../services/haptic.service";
import { AudioSessionService } from "../audio-session.service";
import { AudioImportService } from "../audio-import.service";
import { SnackbarService } from "../../services/snackbar.service";

function transientBuffer(
  impulses: number[],
  length: number,
  sampleRate = 1000,
): AudioBuffer {
  const data = new Float32Array(length);
  for (const frame of impulses) data[frame] = 1;
  return {
    numberOfChannels: 1,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("SamplerComponent", () => {
  let component: SamplerComponent;
  let fixture: ComponentFixture<SamplerComponent>;
  let hapticMock: { light: jest.Mock; medium: jest.Mock; heavy: jest.Mock };

  beforeEach(async () => {
    // Jest-native mocks
    hapticMock = {
      light: jest.fn(),
      medium: jest.fn(),
      heavy: jest.fn(),
    };

    const engineMock = {
      resume: jest.fn(),
      ctx: {
        destination: {},
        currentTime: 0,
        audioWorklet: { addModule: jest.fn().mockResolvedValue(undefined) },
        createGain: jest.fn().mockReturnValue({
          connect: jest.fn(),
          disconnect: jest.fn(),
          gain: { setTargetAtTime: jest.fn(), value: 1 },
        }),
        createBiquadFilter: jest.fn().mockReturnValue({
          type: "",
          frequency: { value: 0 },
          gain: { value: 0 },
          Q: { value: 0 },
          connect: jest.fn(),
          disconnect: jest.fn(),
        }),
        createAudioWorkletNode: jest.fn().mockReturnValue({
          port: { postMessage: jest.fn() },
          connect: jest.fn(),
          disconnect: jest.fn(),
        }),
        createBuffer: jest.fn((channels: number, length: number, sampleRate: number) => {
          const data = Array.from(
            { length: channels },
            () => new Float32Array(length),
          );
          return {
            numberOfChannels: channels,
            length,
            sampleRate,
            duration: length / sampleRate,
            getChannelData: (channel: number) => data[channel],
          };
        }),
      } as unknown as AudioContext,
    };

    const fileLoaderMock = {
      pickLocalFiles: jest.fn().mockResolvedValue([]),
      decodeToAudioBuffer: jest.fn().mockResolvedValue(null),
    };

    const audioSessionMock = {};

    await TestBed.configureTestingModule({
      imports: [SamplerComponent],
      providers: [
        { provide: AudioEngineService, useValue: engineMock },
        { provide: FileLoaderService, useValue: fileLoaderMock },
        { provide: HapticService, useValue: hapticMock },
        { provide: AudioSessionService, useValue: audioSessionMock },
        {
          provide: AudioImportService,
          useValue: {
            pitchShiftBuffer: jest.fn((b: AudioBuffer) => b),
            tempoMatchBuffer: jest.fn((b: AudioBuffer) => b),
            stretchBuffer: jest.fn((b: AudioBuffer) => b),
          },
        },
        {
          provide: SnackbarService,
          useValue: {
            info: jest.fn(),
            success: jest.fn(),
            warning: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SamplerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Wait for async sampler init to settle
    await fixture.whenStable();
  });

  it("should create the component", () => {
    expect(component).toBeTruthy();
  });

  it("should initialize with empty zones", () => {
    expect(component.zones().length).toBe(0);
    expect(component.selectedPitch()).toBeNull();
    expect(component.activeTab()).toBe("zones");
  });

  it("should have default global controls", () => {
    expect(component.masterVolume()).toBe(80);
    expect(component.pitchBend()).toBe(0);
    expect(component.modulation()).toBe(0);
    expect(component.isImporting()).toBe(false);
    expect(component.dragOver()).toBe(false);
    expect(component.autoChopSensitivity()).toBe(55);
  });

  it("should have output channels defined", () => {
    const channels = component.outputChannels;
    expect(channels.length).toBe(8);
    expect(channels[0]).toBe("Master");
    expect(channels[1]).toBe("Ch 1");
    expect(channels[7]).toBe("Ch 7");
  });

  it("should parse input values from events", () => {
    const event = { target: { value: "42" } } as unknown as Event;
    expect(component.getInputValue(event)).toBe(42);

    const selectEvent = { target: { value: "test-value" } } as unknown as Event;
    expect(component.getSelectValue(selectEvent)).toBe("test-value");
  });

  it("should switch active tab", () => {
    expect(component.activeTab()).toBe("zones");
    component.setActiveTab("adsr");
    expect(component.activeTab()).toBe("adsr");
    component.setActiveTab("loops");
    expect(component.activeTab()).toBe("loops");
    component.setActiveTab("routing");
    expect(component.activeTab()).toBe("routing");
    component.setActiveTab("zones");
    expect(component.activeTab()).toBe("zones");
  });

  it("should handle zone selection", () => {
    component.selectZone(60);
    expect(component.selectedPitch()).toBe(60);
    expect(hapticMock.light).toHaveBeenCalled();
  });

  it("should use pointer interactions for sampler keys", () => {
    const samplerMock = {
      play: jest.fn(),
      stop: jest.fn(),
      getZone: jest.fn().mockReturnValue({ sampleBuffers: [] }),
      dispose: jest.fn(),
    };
    (component as any).sampler = samplerMock;

    component.onZonePointerDown({ pointerType: "touch", button: 0 } as any, 60);
    component.onZonePointerUp(60);
    component.onZoneClick(60);

    expect(component.selectedPitch()).toBe(60);
    expect(samplerMock.play).toHaveBeenCalledWith(60, 0.8);
    expect(samplerMock.stop).toHaveBeenCalledWith(60);
  });

  it("does not suppress the next click after a zone pointer cancel", () => {
    component.onZonePointerDown({ pointerType: "touch", button: 0 } as any, 60);
    component.onZonePointerCancel(60);
    component.selectedPitch.set(null);

    component.onZoneClick(60);

    expect(component.selectedPitch()).toBe(60);
  });

  it("should start with stretch controls at defaults", () => {
    expect(component.stretchSemitones()).toBe(0);
    expect(component.stretchSourceBpm()).toBe(120);
  });

  it("auto-chops detected transients onto consecutive pads", () => {
    const buffer = transientBuffer([500, 1200, 2000], 3000);
    const samplerMock = {
      getZone: jest.fn().mockReturnValue({ sampleBuffers: [buffer] }),
      getAllZones: jest.fn().mockReturnValue([]),
      loadSampleToSlot: jest.fn(),
      dispose: jest.fn(),
    };
    (component as any).sampler = samplerMock;
    component.selectedPitch.set(60);
    const snackbar = TestBed.inject(SnackbarService) as any;

    component.autoChopSelected();

    expect(samplerMock.loadSampleToSlot.mock.calls.length).toBeGreaterThan(1);
    expect(samplerMock.loadSampleToSlot.mock.calls[0][0]).toBe(60);
    expect(samplerMock.loadSampleToSlot.mock.calls[0][2]).toBe(0);
    expect(snackbar.success).toHaveBeenCalledWith(
      expect.stringContaining("Auto-chopped"),
    );
  });

  it("explains when no transients are detected", () => {
    const data = new Float32Array(3000).fill(0.5);
    const buffer = {
      numberOfChannels: 1,
      length: data.length,
      sampleRate: 1000,
      duration: 3,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
    const samplerMock = {
      getZone: jest.fn().mockReturnValue({ sampleBuffers: [buffer] }),
      getAllZones: jest.fn().mockReturnValue([]),
      loadSampleToSlot: jest.fn(),
      dispose: jest.fn(),
    };
    (component as any).sampler = samplerMock;
    component.selectedPitch.set(60);
    const snackbar = TestBed.inject(SnackbarService) as any;

    component.autoChopSelected();

    expect(samplerMock.loadSampleToSlot).not.toHaveBeenCalled();
    expect(snackbar.info).toHaveBeenCalledWith(
      expect.stringContaining("No transients found"),
    );
  });

  it("should no-op pitch shift when no sample is loaded", async () => {
    component.selectZone(60); // no actual buffer in the mocked sampler
    await component.applyPitchShift(2);
    expect(hapticMock.medium).not.toHaveBeenCalled();
  });

  it("should expose stretch-engine UI signals for binding", () => {
    component.stretchSemitones.set(-3);
    component.stretchSourceBpm.set(140);
    expect(component.stretchSemitones()).toBe(-3);
    expect(component.stretchSourceBpm()).toBe(140);
  });

  it("should handle drag state", () => {
    expect(component.dragOver()).toBe(false);
    const dragEvent = { preventDefault: () => {} } as DragEvent;
    component.onDragOver(dragEvent);
    expect(component.dragOver()).toBe(true);
    component.onDragLeave();
    expect(component.dragOver()).toBe(false);
  });

  it("should toggle loop without error when sampler is null", () => {
    expect(() => component.toggleLoop(60)).not.toThrow();
  });

  it("should update loop start without error when sampler is null", () => {
    expect(() => component.updateLoopStart(60, 25)).not.toThrow();
  });

  it("should update loop end without error when sampler is null", () => {
    expect(() => component.updateLoopEnd(60, 75)).not.toThrow();
  });

  it("should update loop crossfade without error when sampler is null", () => {
    expect(() => component.updateLoopCrossfade(60, 20)).not.toThrow();
  });

  it("should handle pitch bend changes", () => {
    component.onPitchBendChange(50);
    expect(component.pitchBend()).toBe(50);
    component.onPitchBendChange(75);
    expect(component.pitchBend()).toBe(75);
    component.onPitchBendChange(0);
    expect(component.pitchBend()).toBe(0);
  });

  it("should handle modulation changes", () => {
    component.onModulationChange(50);
    expect(component.modulation()).toBe(50);
    component.onModulationChange(100);
    expect(component.modulation()).toBe(100);
  });

  it("should remove zone without throwing", () => {
    expect(() => component.removeZone(60)).not.toThrow();
    component.selectedPitch.set(60);
    component.removeZone(60);
    expect(component.selectedPitch()).toBeNull();
  });

  it("should call haptic on zone select", () => {
    component.selectZone(60);
    expect(hapticMock.light).toHaveBeenCalled();
  });

  it("should call haptic on tab switch", () => {
    component.setActiveTab("adsr");
    expect(hapticMock.light).toHaveBeenCalled();
  });

  it("should stop all without error", () => {
    expect(() => component.stopAll()).not.toThrow();
  });
});
