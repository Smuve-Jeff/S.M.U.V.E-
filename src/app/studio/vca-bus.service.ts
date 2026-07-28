import { Injectable, computed, signal } from '@angular/core';

/**
 * A Voltage Controlled Amplifier (VCA) bus.
 *
 * Modeled after FL Studio / Ableton / Logic — VCA is a CONTROL SURFACE for
 * grouped volume, not an audio summing bus. The audio graph is untouched;
 * the VCA fader value is multiplied into each assigned track's GainNode
 * via `audioEngine.setVcaMultiplier(trackId, multiplier)`.
 */
export interface VcaBus {
  /** UUID */
  id: string;
  /** Human label shown in the mixer */
  name: string;
  /** Linear fader value (0..1.5); default 1.0 = unity */
  faderValue: number;
  /** When true, all assigned tracks are silenced (multiplier 0) */
  muted: boolean;
}

export type VcaAssignments = Record<string, string | null>;

const STORAGE_KEY = 'smuve_vca_routing_v1';

@Injectable({ providedIn: 'root' })
export class VcaBusService {
  /** All VCA buses in the project. */
  buses = signal<VcaBus[]>([]);

  /** trackId -> vcaId (or null if not assigned) */
  assignments = signal<VcaAssignments>({});

  /** Number of buses in the project. */
  readonly busCount = computed(() => this.buses().length);

  /** Per-bus assigned track count: busId -> count. */
  readonly assignedCountByBus = computed<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const bus of this.buses()) out[bus.id] = 0;
    for (const vcaId of Object.values(this.assignments())) {
      if (vcaId && out[vcaId] !== undefined) out[vcaId] += 1;
    }
    return out;
  });

  constructor() {
    this.load();
  }

  // ── persistence ───────────────────────────────────────────
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        buses?: VcaBus[];
        assignments?: VcaAssignments;
      };
      if (Array.isArray(parsed.buses)) this.buses.set(parsed.buses);
      if (parsed.assignments && typeof parsed.assignments === 'object') {
        this.assignments.set(parsed.assignments);
      }
    } catch {
      // best-effort: ignore corrupt storage
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          buses: this.buses(),
          assignments: this.assignments(),
        })
      );
    } catch {
      // no-op: Safari private mode, etc.
    }
  }

  // ── read helpers ──────────────────────────────────────────
  /** Resolve the active multiplier (1.0 if unassigned or bus muted-with-no-effect handled in caller). */
  effectiveMultiplier(trackId: string): number {
    const vcaId = this.assignments()[trackId];
    if (!vcaId) return 1;
    const bus = this.buses().find((b) => b.id === vcaId);
    if (!bus) return 1;
    return bus.muted ? 0 : Math.max(0, Math.min(1.5, bus.faderValue));
  }

  /** All tracks currently assigned to a given bus. */
  trackIdsForBus(busId: string): string[] {
    return Object.entries(this.assignments())
      .filter(([, v]) => v === busId)
      .map(([k]) => k);
  }

  // ── mutations ─────────────────────────────────────────────
  createBus(name: string): VcaBus {
    const bus: VcaBus = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : 'vca_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
      name: name.trim() || 'VCA',
      faderValue: 1.0,
      muted: false,
    };
    this.buses.update((bs) => [...bs, bus]);
    this.persist();
    return bus;
  }

  deleteBus(busId: string): void {
    this.buses.update((bs) => bs.filter((b) => b.id !== busId));
    this.assignments.update((a) => {
      const out: VcaAssignments = {};
      for (const [k, v] of Object.entries(a)) out[k] = v === busId ? null : v;
      return out;
    });
    this.persist();
  }

  renameBus(busId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.buses.update((bs) =>
      bs.map((b) => (b.id === busId ? { ...b, name: trimmed } : b))
    );
    this.persist();
  }

  assignTrack(trackId: string, busId: string): void {
    this.assignments.update((a) => ({ ...a, [trackId]: busId }));
    this.persist();
  }

  unassignTrack(trackId: string): void {
    this.assignments.update((a) => ({ ...a, [trackId]: null }));
    this.persist();
  }

  setBusFader(busId: string, faderValue: number): void {
    const clamped = Math.max(0, Math.min(1.5, faderValue));
    this.buses.update((bs) =>
      bs.map((b) => (b.id === busId ? { ...b, faderValue: clamped } : b))
    );
    this.persist();
  }

  toggleBusMute(busId: string): void {
    this.buses.update((bs) =>
      bs.map((b) => (b.id === busId ? { ...b, muted: !b.muted } : b))
    );
    this.persist();
  }
}
