import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { Subject } from "rxjs";

import { StudioMidiLearnService } from "./studio-midi-learn.service";
import { AudioSessionService } from "./audio-session.service";
import { MusicManagerService } from "../services/music-manager.service";
import { DjMidiService } from "../services/dj-midi.service";
import { PluginStoreService } from "../services/plugin-store.service";

/**
 * Studio-wide MIDI learn: bind a hardware CC/note to a real parameter, persist
 * it, and drive the same service the UI does. The deck learn path is separate;
 * this is the mixer/transport/scene mapping.
 */
describe("StudioMidiLearnService", () => {
  let service: StudioMidiLearnService;

  const cc = new Subject<{ controller: number; value: number; channel: number }>();
  const noteOn = new Subject<{ note: number; velocity: number; channel: number }>();
  const noteOff = new Subject<{ note: number; velocity: number; channel: number }>();
  const tracks = signal<any[]>([
    { id: "t1", name: "Keys", type: "midi", patternSlots: [] },
    { id: "t2", name: "Vocal", type: "audio", patternSlots: [] },
  ]);

  const audioSession = {
    updateMasterVolume: jest.fn(),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
    stop: jest.fn(),
    isPlaying: signal(false),
  };

  const musicManager = {
    tracks,
    updateVolume: jest.fn(),
    updateTrackPan: jest.fn(),
    updateSend: jest.fn(),
    stopScenePlayback: jest.fn(),
    backToArrangement: jest.fn(),
    launchSceneColumn: jest.fn(),
    nextSceneColumn: jest.fn(() => 1),
  };

  const pluginStore = {
    enabled: signal(new Set(["smuve.saturation.v2"])),
    catalog: [
      {
        id: "smuve.saturation.v2",
        name: "Saturation",
        params: [
          {
            id: "amount",
            label: "Amount",
            min: 0,
            max: 1,
            step: 0.01,
            default: 0.5,
          },
        ],
      },
      {
        id: "smuve.dynamics.v2",
        name: "Dynamics",
        params: [{ id: "ratio", label: "Ratio", min: 1, max: 20, step: 0.1, default: 4 }],
      },
    ],
    setParam: jest.fn(),
  };

  const djMidi = {
    performerCC: cc,
    performerNoteOn: noteOn,
    performerNoteOff: noteOff,
    autoInit: jest.fn(),
    connectedDevices: signal<string[]>([]),
    midiInputNames: signal<string[]>([]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        StudioMidiLearnService,
        { provide: AudioSessionService, useValue: audioSession },
        { provide: MusicManagerService, useValue: musicManager },
        { provide: DjMidiService, useValue: djMidi },
        { provide: PluginStoreService, useValue: pluginStore },
      ],
    });
    service = TestBed.inject(StudioMidiLearnService);
  });

  it("lists real targets and excludes audio channels", () => {
    const ids = service.targets().map((target) => target.id);
    expect(ids).toContain("master.volume");
    expect(ids).toContain("track:t1:volume");
    expect(ids).toContain("track:t1:pan");
    expect(ids).not.toContain("track:t2:volume");
    expect(ids).toContain("transport.toggle");
  });

  it("learns a CC for master volume and applies it", () => {
    service.startLearning("master.volume");
    expect(service.learning()?.target).toBe("master.volume");

    cc.next({ controller: 7, value: 0.64, channel: 0 });

    const binding = service.bindingFor("master.volume");
    expect(binding).toMatchObject({ type: "cc", number: 7, channel: 0 });
    expect(service.learning()).toBeNull();
    expect(service.lastLearned()).toContain("Master volume");

    cc.next({ controller: 7, value: 0.5, channel: 0 });
    expect(audioSession.updateMasterVolume).toHaveBeenCalledWith(50);
  });

  it("maps a channel fader and pan onto the music manager", () => {
    service.startLearning("track:t1:volume");
    cc.next({ controller: 21, value: 1, channel: 2 });
    service.startLearning("track:t1:pan");
    cc.next({ controller: 22, value: 0, channel: 2 });

    cc.next({ controller: 21, value: 0.5, channel: 2 });
    expect(musicManager.updateVolume).toHaveBeenCalledWith("t1", 0.75);
    cc.next({ controller: 22, value: 0, channel: 2 });
    expect(musicManager.updateTrackPan).toHaveBeenCalledWith("t1", -100);
  });

  it("lists aux sends for every channel and only enabled plugin params", () => {
    const ids = service.targets().map((target) => target.id);
    expect(ids).toContain("track:t1:sendA");
    expect(ids).toContain("track:t1:sendB");
    // Audio channels have sends too, even though they have no fader target.
    expect(ids).toContain("track:t2:sendA");
    expect(ids).toContain("plugin:smuve.saturation.v2:amount");
    expect(ids).not.toContain("plugin:smuve.dynamics.v2:ratio");
    expect(service.groups().map((group) => group.label)).toEqual(
      expect.arrayContaining(["Sends", "Plugins"]),
    );
  });

  it("learns a CC for an aux send and applies the real send", () => {
    service.startLearning("track:t1:sendA");
    cc.next({ controller: 91, value: 1, channel: 0 });

    expect(service.bindingFor("track:t1:sendA")).toMatchObject({
      type: "cc",
      number: 91,
    });
    cc.next({ controller: 91, value: 0.42, channel: 0 });
    expect(musicManager.updateSend).toHaveBeenCalledWith("t1", "A", 0.42);

    service.startLearning("track:t1:sendB");
    cc.next({ controller: 93, value: 1, channel: 0 });
    cc.next({ controller: 93, value: 0.2, channel: 0 });
    expect(musicManager.updateSend).toHaveBeenCalledWith("t1", "B", 0.2);
  });

  it("maps a knob onto the plugin parameter's own range", () => {
    service.startLearning("plugin:smuve.saturation.v2:amount");
    cc.next({ controller: 74, value: 1, channel: 0 });
    expect(service.bindingFor("plugin:smuve.saturation.v2:amount")).toBeDefined();

    cc.next({ controller: 74, value: 0.25, channel: 0 });
    expect(pluginStore.setParam).toHaveBeenCalledWith(
      "smuve.saturation.v2",
      "amount",
      0.25,
    );
  });

  it("fires momentary targets only on the rising edge", () => {
    service.startLearning("transport.toggle");
    cc.next({ controller: 64, value: 1, channel: 0 });
    expect(audioSession.togglePlay).not.toHaveBeenCalled();

    cc.next({ controller: 64, value: 1, channel: 0 });
    expect(audioSession.togglePlay).toHaveBeenCalledTimes(1);
    cc.next({ controller: 64, value: 1, channel: 0 });
    expect(audioSession.togglePlay).toHaveBeenCalledTimes(1);

    cc.next({ controller: 64, value: 0, channel: 0 });
    cc.next({ controller: 64, value: 1, channel: 0 });
    expect(audioSession.togglePlay).toHaveBeenCalledTimes(2);
  });

  it("learns a pad note for a transport action", () => {
    service.startLearning("record.toggle");
    noteOn.next({ note: 36, velocity: 1, channel: 0 });

    expect(service.bindingFor("record.toggle")).toMatchObject({
      type: "note",
      number: 36,
    });
    noteOn.next({ note: 36, velocity: 1, channel: 0 });
    expect(audioSession.toggleRecord).toHaveBeenCalledTimes(1);
  });

  it("refuses to bind a note to a continuous target", () => {
    service.startLearning("master.volume");
    noteOn.next({ note: 40, velocity: 1, channel: 0 });
    expect(service.bindingFor("master.volume")).toBeUndefined();
    expect(service.learning()?.target).toBe("master.volume");
  });

  it("fires scene controls against the real scene state", () => {
    service.startLearning("scene.next");
    noteOn.next({ note: 50, velocity: 1, channel: 0 });
    noteOn.next({ note: 50, velocity: 1, channel: 0 });
    expect(musicManager.launchSceneColumn).toHaveBeenCalledWith(1);

    service.startLearning("scene.back");
    cc.next({ controller: 70, value: 1, channel: 0 });
    cc.next({ controller: 70, value: 1, channel: 0 });
    expect(musicManager.backToArrangement).toHaveBeenCalled();
  });

  it("persists bindings and forgets them by target", () => {
    service.startLearning("master.volume");
    cc.next({ controller: 5, value: 1, channel: 0 });

    expect(localStorage.getItem("smuve_studio_midi_learn_v1")).toContain(
      "master.volume",
    );

    service.forgetTarget("master.volume");
    expect(service.bindingFor("master.volume")).toBeUndefined();
    expect(localStorage.getItem("smuve_studio_midi_learn_v1")).toBe("[]");
  });
});
