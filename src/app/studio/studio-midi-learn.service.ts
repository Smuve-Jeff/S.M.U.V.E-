import { Injectable, computed, inject, signal } from "@angular/core";
import { Subscription } from "rxjs";

import { AudioSessionService } from "./audio-session.service";
import { MusicManagerService } from "../services/music-manager.service";
import { DjMidiService } from "../services/dj-midi.service";
import { PluginStoreService } from "../services/plugin-store.service";

export type StudioMidiTargetKind = "continuous" | "momentary";

/** A parameter the artist can bind to a hardware control. */
export interface StudioMidiTarget {
  /** Stable id, also stored on the binding: `master.volume`, `track:<id>:pan`. */
  id: string;
  label: string;
  group: string;
  kind: StudioMidiTargetKind;
}

export interface StudioMidiBinding {
  id: string;
  channel: number;
  type: "cc" | "note";
  number: number;
  target: string;
  /** Human label captured at learn time, shown even if the target disappears. */
  label: string;
}

export interface StudioMidiLearnRequest {
  target: string;
  label: string;
  kind: StudioMidiTargetKind;
}

const STORAGE_KEY = "smuve_studio_midi_learn_v1";

function loadBindings(): StudioMidiBinding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StudioMidiBinding =>
        !!entry &&
        typeof entry.id === "string" &&
        typeof entry.target === "string" &&
        typeof entry.number === "number" &&
        (entry.type === "cc" || entry.type === "note"),
    );
  } catch {
    return [];
  }
}

/**
 * Studio-wide MIDI learn.
 *
 * The decks and the performer already had CC learn; the mixer, transport and
 * scene launcher did not. This binds any incoming CC (or note) to a real
 * parameter, persists the map, and — crucially — learns in the same place the
 * parameter lives, so there is no second value to keep in sync.
 *
 * Continuous targets follow the CC value directly; momentary targets fire on
 * the rising edge (CC crosses 0.5, or a note-on), because a held button must
 * not toggle a transport forty times a second.
 */
@Injectable({ providedIn: "root" })
export class StudioMidiLearnService {
  private readonly audioSession = inject(AudioSessionService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly djMidi = inject(DjMidiService);
  private readonly pluginStore = inject(PluginStoreService);

  readonly bindings = signal<StudioMidiBinding[]>(loadBindings());
  readonly learning = signal<StudioMidiLearnRequest | null>(null);
  /** Last learned message, so the panel can confirm without a snackbar. */
  readonly lastLearned = signal<string>("");

  private readonly subscriptions = new Subscription();
  /** Previous CC value per (channel, controller) for rising-edge detection. */
  private readonly lastCCValue = new Map<string, number>();

  constructor() {
    this.subscriptions.add(
      this.djMidi.performerCC.subscribe((event) => {
        this.handleCC(event.channel ?? 0, event.controller, event.value);
      }),
    );
    this.subscriptions.add(
      this.djMidi.performerNoteOn.subscribe((event) => {
        this.handleNote(event.channel ?? 0, event.note, event.velocity ?? 1);
      }),
    );
    // Persisted bindings should work as soon as the Studio is open, not only
    // after the hardware panel has been visited once.
    void this.djMidi.autoInit?.();
  }

  /** Every bindable destination, grouped for the panel. */
  readonly targets = computed<StudioMidiTarget[]>(() => {
    const list: StudioMidiTarget[] = [
      {
        id: "master.volume",
        label: "Master volume",
        group: "Mix",
        kind: "continuous",
      },
    ];
    for (const track of this.musicManager.tracks()) {
      // Sends apply to audio channels too (that is the whole point of a
      // reverb/echo return), so they are listed for every real channel.
      list.push(
        {
          id: `track:${track.id}:sendA`,
          label: `${track.name} · Send A (verb)`,
          group: "Sends",
          kind: "continuous",
        },
        {
          id: `track:${track.id}:sendB`,
          label: `${track.name} · Send B (echo)`,
          group: "Sends",
          kind: "continuous",
        },
      );
      if (track.type === "audio") continue;
      list.push(
        {
          id: `track:${track.id}:volume`,
          label: `${track.name} · Volume`,
          group: "Channels",
          kind: "continuous",
        },
        {
          id: `track:${track.id}:pan`,
          label: `${track.name} · Pan`,
          group: "Channels",
          kind: "continuous",
        },
      );
    }

    // WASM insert parameters. These are global to the plugin instance (the
    // store owns one parameter set per plugin), which is exactly what the
    // master polish chain reads, so a knob move here is the same edit the
    // Plugin Store makes.
    const enabled = this.pluginStore.enabled();
    for (const plugin of this.pluginStore.catalog) {
      if (!enabled.has(plugin.id)) continue;
      for (const param of plugin.params) {
        list.push({
          id: `plugin:${plugin.id}:${param.id}`,
          label: `${plugin.name} · ${param.label}`,
          group: "Plugins",
          kind: "continuous",
        });
      }
    }
    list.push(
      {
        id: "transport.toggle",
        label: "Play / Stop",
        group: "Transport",
        kind: "momentary",
      },
      {
        id: "transport.stop",
        label: "Stop (and stop scenes)",
        group: "Transport",
        kind: "momentary",
      },
      {
        id: "record.toggle",
        label: "Record",
        group: "Transport",
        kind: "momentary",
      },
      {
        id: "scene.next",
        label: "Next scene",
        group: "Scenes",
        kind: "momentary",
      },
      {
        id: "scene.back",
        label: "Back to song",
        group: "Scenes",
        kind: "momentary",
      },
    );
    return list;
  });

  readonly groups = computed(() => {
    const grouped = new Map<string, StudioMidiTarget[]>();
    for (const target of this.targets()) {
      const items = grouped.get(target.group) ?? [];
      items.push(target);
      grouped.set(target.group, items);
    }
    return [...grouped.entries()].map(([label, items]) => ({ label, items }));
  });

  /** Arm learn for a target; the next matching CC/note binds to it. */
  startLearning(target: StudioMidiTarget | string): void {
    const resolved =
      typeof target === "string"
        ? this.targets().find((entry) => entry.id === target)
        : target;
    if (!resolved) return;
    this.learning.set({
      target: resolved.id,
      label: resolved.label,
      kind: resolved.kind,
    });
    this.lastLearned.set("");
    // Make sure the MIDI inputs are actually open before waiting for a move.
    this.djMidi.autoInit?.();
  }

  cancelLearning(): void {
    this.learning.set(null);
  }

  /** Remove the mapping (if any) for a target. */
  forgetTarget(targetId: string): void {
    this.bindings.update((list) =>
      list.filter((binding) => binding.target !== targetId),
    );
    this.persist();
  }

  removeBinding(id: string): void {
    this.bindings.update((list) => list.filter((binding) => binding.id !== id));
    this.persist();
  }

  bindingFor(targetId: string): StudioMidiBinding | undefined {
    return this.bindings().find((binding) => binding.target === targetId);
  }

  /** Called by DjMidiService for every incoming control change. */
  handleCC(channel: number, controller: number, value: number): void {
    if (!Number.isFinite(value) || !Number.isFinite(controller)) return;
    if (this.tryLearn(channel, "cc", controller)) return;

    const binding = this.bindingForMessage(channel, "cc", controller);
    if (!binding) return;
    const normalized = Math.max(0, Math.min(1, value));

    if (this.isMomentary(binding.target)) {
      const key = `${channel}:${controller}`;
      const previous = this.lastCCValue.get(key) ?? 0;
      this.lastCCValue.set(key, normalized);
      if (normalized >= 0.5 && previous < 0.5) this.applyMomentary(binding.target);
      return;
    }
    this.lastCCValue.set(`${channel}:${controller}`, normalized);
    this.applyContinuous(binding.target, normalized);
  }

  /** Called by DjMidiService for every note-on. */
  handleNote(channel: number, note: number, velocity: number): void {
    if (!Number.isFinite(note)) return;
    if (this.tryLearn(channel, "note", note)) return;
    const binding = this.bindingForMessage(channel, "note", note);
    if (!binding || velocity <= 0) return;
    if (this.isMomentary(binding.target)) {
      this.applyMomentary(binding.target);
    } else {
      this.applyContinuous(binding.target, Math.min(1, velocity));
    }
  }

  private tryLearn(
    channel: number,
    type: "cc" | "note",
    number: number,
  ): boolean {
    const request = this.learning();
    if (!request) return false;
    // A note cannot express a continuous sweep; wait for the CC instead.
    if (request.kind === "continuous" && type === "note") return false;

    const binding: StudioMidiBinding = {
      id: `midi-${Date.now().toString(36)}`,
      channel,
      type,
      number,
      target: request.target,
      label: request.label,
    };
    this.bindings.update((list) => [
      ...list.filter((entry) => entry.target !== request.target),
      binding,
    ]);
    this.persist();
    this.lastLearned.set(
      `${request.label} ← ${type === "cc" ? "CC" : "Note"} ${number} (ch ${channel + 1})`,
    );
    this.learning.set(null);
    return true;
  }

  private bindingForMessage(
    channel: number,
    type: "cc" | "note",
    number: number,
  ): StudioMidiBinding | undefined {
    return this.bindings().find(
      (binding) =>
        binding.type === type &&
        binding.number === number &&
        // Channel 0 in a binding means "any channel" for device-agnostic maps.
        (binding.channel === channel || binding.channel === 0),
    );
  }

  private isMomentary(targetId: string): boolean {
    return (
      this.targets().find((target) => target.id === targetId)?.kind ===
      "momentary"
    );
  }

  private applyContinuous(targetId: string, normalized: number): void {
    const value = Math.max(0, Math.min(1, normalized));
    if (targetId === "master.volume") {
      this.audioSession.updateMasterVolume(Math.round(value * 100));
      return;
    }
    const parts = targetId.split(":");

    if (parts[0] === "plugin" && parts.length >= 3) {
      const [, pluginId, ...paramParts] = parts;
      const paramId = paramParts.join(":");
      const plugin = this.pluginStore.catalog.find(
        (entry) => entry.id === pluginId,
      );
      const param = plugin?.params.find((entry) => entry.id === paramId);
      if (!param) return;
      // The store clamps and persists; mapping normalised CC travel onto the
      // parameter's own range keeps a hardware fader usable even when the
      // plugin's units are dB, Hz or milliseconds.
      this.pluginStore.setParam(
        pluginId,
        paramId,
        param.min + value * (param.max - param.min),
      );
      return;
    }

    if (parts[0] !== "track" || parts.length < 3) return;
    const [, trackId, parameter] = parts;
    if (parameter === "volume") {
      this.musicManager.updateVolume(trackId, value * 1.5);
    } else if (parameter === "pan") {
      this.musicManager.updateTrackPan(trackId, (value * 2 - 1) * 100);
    } else if (parameter === "sendA" || parameter === "sendB") {
      this.musicManager.updateSend(
        trackId,
        parameter === "sendA" ? "A" : "B",
        value,
      );
    }
  }

  private applyMomentary(targetId: string): void {
    switch (targetId) {
      case "transport.toggle":
        this.audioSession.togglePlay();
        break;
      case "transport.stop":
        this.musicManager.stopScenePlayback();
        if (this.audioSession.isPlaying()) this.audioSession.stop();
        break;
      case "record.toggle":
        void this.audioSession.toggleRecord();
        break;
      case "scene.next": {
        const next = this.musicManager.nextSceneColumn();
        if (next !== null) this.musicManager.launchSceneColumn(next);
        break;
      }
      case "scene.back":
        this.musicManager.backToArrangement();
        break;
      default:
        break;
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings()));
    } catch {
      // Storage may be unavailable; bindings still work for this session.
    }
  }

  dispose(): void {
    this.subscriptions.unsubscribe();
  }
}
