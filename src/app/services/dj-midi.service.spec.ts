import { TestBed } from '@angular/core/testing';
import { DjMidiService } from './dj-midi.service';
import { DeckService } from './deck.service';
import { LoggingService } from './logging.service';

/**
 * Contract under test: the performer device picker's ON/OFF toggles must
 * actually gate MIDI input listeners — not just re-style rows. Disabling a
 * device detaches its onmidimessage; enabling (or clearing the allow-list)
 * re-attaches it.
 */
describe('DjMidiService device gating', () => {
  let service: DjMidiService;
  let deviceA: { name: string; onmidimessage: unknown; send: jest.Mock };
  let deviceB: { name: string; onmidimessage: unknown; send: jest.Mock };
  let midiAccess: {
    inputs: Map<string, any>;
    outputs: Map<string, any>;
    onstatechange: unknown;
  };

  beforeEach(() => {
    deviceA = { name: 'Controller X', onmidimessage: null, send: jest.fn() };
    deviceB = { name: 'Keyboard Y', onmidimessage: null, send: jest.fn() };

    midiAccess = {
      inputs: new Map([
        ['a', deviceA],
        ['b', deviceB],
      ]),
      outputs: new Map(),
      onstatechange: null,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: DeckService, useValue: {} },
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn() } },
      ],
    });
    service = TestBed.inject(DjMidiService);

    // Inject a fake MIDIAccess and rescan — no real Web MIDI in jsdom.
    (service as any).midiAccess = midiAccess;
    (service as any).setupInputs();
  });

  it('all devices listen when the enable list is empty (default)', () => {
    expect(deviceA.onmidimessage).toBeInstanceOf(Function);
    expect(deviceB.onmidimessage).toBeInstanceOf(Function);
    expect(service.connectedDevices()).toEqual(['Controller X', 'Keyboard Y']);
  });

  it('disabling a device detaches its listener; enabling re-attaches', () => {
    // Empty list = all enabled. Adding 'Controller X' to the enable list
    // makes it the ONLY enabled device → 'Keyboard Y' gets detached.
    service.toggleDevice('Controller X');
    expect(deviceB.onmidimessage).toBeNull();
    expect(deviceA.onmidimessage).toBeInstanceOf(Function);

    service.toggleDevice('Controller X'); // list empty again → all on
    expect(deviceB.onmidimessage).toBeInstanceOf(Function);
  });

  it('explicit allow-list keeps unlisted devices detached across rescans', () => {
    service.toggleDevice('Controller X'); // only Controller X enabled
    // A device statechange triggers a rescan (same objects, fresh enumeration)
    (service as any).setupInputs();
    expect(deviceA.onmidimessage).toBeInstanceOf(Function);
    expect(deviceB.onmidimessage).toBeNull();
  });

  it('disabled device messages never reach handleMidi', () => {
    const noteOn = {
      data: [0x90, 60, 100],
      target: deviceA as unknown as MIDIPort,
    } as unknown as MIDIMessageEvent;

    // Detach A by enabling only B:
    service.toggleDevice('Keyboard Y');
    expect(deviceA.onmidimessage).toBeNull();
    expect(service.lastMidiMessage()).toBeNull();

    // Re-enable all via the public toggle — listener re-attached, flow resumes:
    service.toggleDevice('Keyboard Y');
    expect(deviceA.onmidimessage).toBeInstanceOf(Function);
    (deviceA.onmidimessage as (m: unknown) => void)(noteOn);
    expect(service.lastMidiMessage()).not.toBeNull();
  });
});
