import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { HardwareConnectionsComponent } from "./hardware-connections.component";
import {
  AudioEngineLatencyService,
  type LoopbackMeasurement,
} from "../../services/audio-engine-latency.service";
import { StudioMidiLearnService } from "../studio-midi-learn.service";
import { DjMidiService } from "../../services/dj-midi.service";
import { MicrophoneService } from "../../services/microphone.service";
import { GamepadService } from "../../services/gamepad.service";

describe("HardwareConnectionsComponent input latency", () => {
  let component: HardwareConnectionsComponent;
  let fixture: ComponentFixture<HardwareConnectionsComponent>;

  const latencyMock = {
    appliedCompensationMs: signal(0),
    snapshot: signal({ totalLatencyMs: 42 }),
    calibrateAndApply: jest.fn(async () => {
      latencyMock.appliedCompensationMs.set(42);
      return {
        measuredLatencyMs: 42,
        recommendedCompensationMs: 42,
        benchmarkSpeedRatio: 1,
        capturedAt: Date.now(),
      };
    }),
    lastLoopback: signal<LoopbackMeasurement | null>(null),
    calibrateWithLoopback: jest.fn(async () => {
      latencyMock.appliedCompensationMs.set(38);
      const measurement: LoopbackMeasurement = {
        roundTripMs: 38,
        quality: "good",
        clicks: [
          {
            roundTripMs: 36,
            onsetFrame: 1728,
            peak: 0.8,
            signalToNoise: 20,
            quality: "good",
          },
          {
            roundTripMs: 38,
            onsetFrame: 1824,
            peak: 0.7,
            signalToNoise: 14,
            quality: "good",
          },
          {
            roundTripMs: 40,
            onsetFrame: 1920,
            peak: 0.3,
            signalToNoise: 4,
            quality: "fair",
          },
        ],
        clickScheduledAt: 5.1,
        detectedAt: 5.138,
        onsetFrame: 1824,
        sampleRate: 48000,
        capturedAt: Date.now(),
      };
      latencyMock.lastLoopback.set(measurement);
      return measurement;
    }),
  };

  const midiLearnMock = {
    groups: signal([] as unknown[]),
    learning: signal(null),
    lastLearned: signal(""),
    bindingFor: jest.fn(() => null),
    startLearning: jest.fn(),
    cancelLearning: jest.fn(),
    forgetTarget: jest.fn(),
  };

  const midiMock = {
    connectedDevices: signal([]),
    midiInputNames: signal([]),
    autoInit: jest.fn(),
  };

  const microphoneMock = {
    availableDevices: signal([]),
    selectedDeviceId: signal(""),
    updateAvailableDevices: jest.fn(),
  };

  const gamepadMock = {
    connectedGamepad: signal(null),
  };

  beforeEach(async () => {
    latencyMock.appliedCompensationMs.set(0);
    latencyMock.calibrateAndApply.mockClear();
    latencyMock.calibrateWithLoopback.mockClear();
    latencyMock.lastLoopback.set(null);

    await TestBed.configureTestingModule({
      imports: [HardwareConnectionsComponent],
      providers: [
        { provide: AudioEngineLatencyService, useValue: latencyMock },
        { provide: StudioMidiLearnService, useValue: midiLearnMock },
        { provide: DjMidiService, useValue: midiMock },
        { provide: MicrophoneService, useValue: microphoneMock },
        { provide: GamepadService, useValue: gamepadMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HardwareConnectionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("renders the calibration action and the applied compensation", () => {
    const section = fixture.nativeElement.querySelector(
      '[aria-labelledby="hw-latency-title"]',
    ) as HTMLElement;
    expect(section.textContent).toContain("Estimate from engine");
    expect(section.textContent).toContain("Measure loopback");
    expect(section.textContent).toContain("0 ms applied");
  });

  it("calibrates the device and reports the applied compensation", async () => {
    await component.calibrateInputLatency();
    fixture.detectChanges();

    expect(latencyMock.calibrateAndApply).toHaveBeenCalledWith(1);
    expect(component.calibrationRunning()).toBe(false);
    expect(component.calibrationNotice()).toBe(
      "Measured 42 ms — new takes align by 42 ms.",
    );
    expect(fixture.nativeElement.textContent).toContain("42 ms applied");
  });

  it("measures true loopback latency and reports the applied value", async () => {
    await component.measureLoopback();
    fixture.detectChanges();

    expect(latencyMock.calibrateWithLoopback).toHaveBeenCalledTimes(1);
    expect(component.loopbackRunning()).toBe(false);
    expect(component.calibrationNotice()).toBe(
      "Loopback median 38 ms from 3 clicks (2 good) — new takes align by 38 ms.",
    );
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("38 ms applied");
    expect(text).toContain("Click 1");
    expect(text).toContain("36 ms");
    expect(text).toContain("40 ms");
    expect(text).toContain("fair");
    expect(text).toContain("Median");
  });

  it("shows the loopback error when the click is not captured", async () => {
    latencyMock.calibrateWithLoopback.mockRejectedValueOnce(
      new Error("The calibration click was not captured — check routing."),
    );

    await component.measureLoopback();

    expect(component.loopbackRunning()).toBe(false);
    expect(component.calibrationNotice()).toContain("not captured");
  });

  it("surfaces a failed calibration instead of claiming success", async () => {
    latencyMock.calibrateAndApply.mockRejectedValueOnce(new Error("no context"));

    await component.calibrateInputLatency();

    expect(component.calibrationRunning()).toBe(false);
    expect(component.calibrationNotice()).toContain("Calibration failed");
    expect(latencyMock.appliedCompensationMs()).toBe(0);
  });
});
