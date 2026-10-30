import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { HardwareConnectionsComponent } from "./hardware-connections.component";
import { AudioEngineLatencyService } from "../../services/audio-engine-latency.service";
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
    calibrateWithLoopback: jest.fn(async () => {
      latencyMock.appliedCompensationMs.set(38);
      return {
        roundTripMs: 38,
        clickScheduledAt: 5.1,
        detectedAt: 5.138,
        onsetFrame: 1824,
        sampleRate: 48000,
        capturedAt: Date.now(),
      };
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
      "Loopback measured 38 ms — new takes align by 38 ms.",
    );
    expect(fixture.nativeElement.textContent).toContain("38 ms applied");
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
