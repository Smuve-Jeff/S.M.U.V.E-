import { Component, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";

import { StudioMidiLearnService } from "../studio-midi-learn.service";
import { DjMidiService } from "../../services/dj-midi.service";
import { MicrophoneService } from "../../services/microphone.service";
import { GamepadService } from "../../services/gamepad.service";

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
