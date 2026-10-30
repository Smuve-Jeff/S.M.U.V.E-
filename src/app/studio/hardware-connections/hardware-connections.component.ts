import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";

import { StudioMidiLearnService } from "../studio-midi-learn.service";
import { DjMidiService } from "../../services/dj-midi.service";
import { MicrophoneService } from "../../services/microphone.service";
import { GamepadService } from "../../services/gamepad.service";
import { AudioEngineLatencyService } from "../../services/audio-engine-latency.service";

/**
 * External connections: what the browser can actually see and control.
 *
 * Browsers expose MIDI inputs, audio input devices and gamepads, but they do
 * not expose interface preamps: phantom power (+48V), pad, gain and input
 * impedance are switched on the hardware or in the vendor's driver. This panel
 * reports what the device itself claims (from `enumerateDevices` labels) and
 * says so plainly instead of offering a toggle that could never work.
 */
@Component({
  selector: "app-hardware-connections",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./hardware-connections.component.html",
  styleUrls: [
    "./hardware-connections.component.css",
    "../shared/platform-ux.css",
  ],
})
export class HardwareConnectionsComponent {
  readonly midiLearn = inject(StudioMidiLearnService);
  readonly midi = inject(DjMidiService);
  readonly microphone = inject(MicrophoneService);
  readonly gamepad = inject(GamepadService);
  /**
   * The same service the recording path reads. Calibrating here writes the
   * applied compensation that placed takes use to sit on the punch.
   */
  readonly latency = inject(AudioEngineLatencyService);
  /** One calibration at a time; a double tap must not start two renders. */
  readonly calibrationRunning = signal(false);
  readonly loopbackRunning = signal(false);
  readonly calibrationNotice = signal<string | null>(null);

  readonly midiDevices = computed(() => {
    const connected = this.midi.connectedDevices();
    const inputs = this.midi.midiInputNames();
    return connected.length > 0 ? connected : inputs;
  });

  readonly micDevices = computed(() =>
    this.microphone
      .availableDevices()
      .filter((device) => device.type !== "midi"),
  );

  readonly selectedMic = computed(() => {
    const id = this.microphone.selectedDeviceId();
    return this.micDevices().find((device) => device.deviceId === id) ?? null;
  });

  readonly selectedNeedsPhantom = computed(
    () => !!this.selectedMic()?.capabilities.includes("phantom-power"),
  );

  /** Gamepad buttons mapped to transport, mirrors TransportBarComponent. */
  readonly gamepadMap: { button: string; action: string }[] = [
    { button: "A", action: "Play / Stop" },
    { button: "B", action: "Stop (and stop scenes)" },
    { button: "X", action: "Record" },
    { button: "Y", action: "Back to song" },
    { button: "LB / RB", action: "Previous / next scene" },
  ];

  connectMidi(): void {
    void this.midi.autoInit();
  }

  refreshInputs(): void {
    void this.microphone.updateAvailableDevices(true);
  }

  /**
   * Measure this device and apply the result to the hydrated profile. The
   * recording path picks it up immediately: `placed takes` read the applied
   * compensation when they compute their punch alignment.
   */
  async calibrateInputLatency(): Promise<void> {
    if (this.calibrationRunning() || this.loopbackRunning()) return;
    this.calibrationRunning.set(true);
    this.calibrationNotice.set(null);
    try {
      const calibration = await this.latency.calibrateAndApply(1);
      const applied = this.latency.appliedCompensationMs();
      this.calibrationNotice.set(
        applied > 0
          ? `Measured ${calibration.measuredLatencyMs} ms — new takes align by ${applied} ms.`
          : calibration.measuredLatencyMs > 0
            ? `Measured ${calibration.measuredLatencyMs} ms, but the profile was not updated.`
            : "Measured 0 ms — no compensation needed on this device.",
      );
    } catch {
      this.calibrationNotice.set(
        "Calibration failed. Start the engine with Play, then try again.",
      );
    } finally {
      this.calibrationRunning.set(false);
    }
  }

  /**
   * True loopback: play three clicks, capture them through the input, and apply
   * the median output→input round trip. Slower and acoustic, but it measures
   * the path the artist actually records through.
   */
  async measureLoopback(): Promise<void> {
    if (this.loopbackRunning() || this.calibrationRunning()) return;
    this.loopbackRunning.set(true);
    this.calibrationNotice.set(null);
    try {
      const measurement = await this.latency.calibrateWithLoopback();
      const goodClicks = measurement.clicks.filter(
        (click) => click.quality === "good",
      ).length;
      const retries = Math.max(0, measurement.attempts - 1);
      const retryText = retries
        ? ` after ${retries} retr${retries === 1 ? "y" : "ies"}`
        : "";
      this.calibrationNotice.set(
        measurement.roundTripMs > 0
          ? `Loopback median ${measurement.roundTripMs} ms from ${measurement.clicks.length} clicks (${goodClicks} good)${retryText} · ${measurement.confidence} confidence — new takes align by ${this.latency.appliedCompensationMs()} ms.`
          : "Loopback measured 0 ms — check the input is hearing the output.",
      );
    } catch (error) {
      this.calibrationNotice.set(
        error instanceof Error
          ? error.message
          : "Loopback measurement failed. Check the audio routing and retry.",
      );
    } finally {
      this.loopbackRunning.set(false);
    }
  }

  capabilityLabel(capability: string): string {
    switch (capability) {
      case "phantom-power":
        return "48V capable";
      case "usb-interface":
        return "USB interface";
      case "headphone-monitoring":
        return "Headphone out";
      case "stereo":
        return "Stereo";
      case "midi-ready":
        return "MIDI";
      case "speakerphone":
        return "Speakerphone";
      default:
        return capability;
    }
  }
}
