import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { HardwareService } from "./hardware.service";
import { LoggingService } from "./logging.service";
import { MicrophoneService } from "./microphone.service";
import { NativeMidiService } from "./native-midi.service";
import {
  MidiInputBusService,
  type MidiInputMessage,
} from "./midi-input-bus.service";

describe("HardwareService native MIDI", () => {
  let nativeMidi: {
    devices: ReturnType<typeof signal>;
    refresh: jest.Mock;
    connectInputs: jest.Mock;
    onMessage?: (data: number[], deviceId: string) => void;
  };

  beforeEach(() => {
    delete (navigator as any).requestMIDIAccess;
    nativeMidi = {
      devices: signal([
        {
          id: "native-1",
          name: "USB Keys",
          manufacturer: "Acme",
          sendPorts: [],
          receivePorts: [0],
        },
      ]),
      refresh: jest.fn().mockResolvedValue(true),
      connectInputs: jest.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        HardwareService,
        MidiInputBusService,
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: MicrophoneService,
          useValue: {
            availableDevices: signal([]),
            updateAvailableDevices: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: NativeMidiService, useValue: nativeMidi },
      ],
    });
  });

  it("opens the native bridge and fans its messages into the bus", async () => {
    const service = TestBed.inject(HardwareService);
    const bus = TestBed.inject(MidiInputBusService);
    const messages: MidiInputMessage[] = [];
    bus.messages$.subscribe((message) => messages.push(message));

    const status = await service.connectMidi();

    expect(status).toBe("ready");
    expect(service.midiStatus()).toBe("ready");
    expect(service.midiInputs()).toEqual([
      { id: "native-1", name: "USB Keys", manufacturer: "Acme" },
    ]);
    expect(bus.state()).toEqual({
      available: true,
      native: true,
      inputs: [
        {
          id: "native-1",
          name: "USB Keys",
          manufacturer: "Acme",
          native: true,
        },
      ],
    });

    nativeMidi.onMessage?.([0x90, 60, 100], "native-1");

    expect(messages).toHaveLength(1);
    expect(messages[0].source).toEqual({
      id: "native-1",
      name: "USB Keys",
      manufacturer: "Acme",
      native: true,
    });
    expect(messages[0].data).toEqual([0x90, 60, 100]);
    expect(service.status().midiDevicesConnected).toBe(1);
  });
});
