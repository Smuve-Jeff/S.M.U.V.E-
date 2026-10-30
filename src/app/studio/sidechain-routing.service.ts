import { Injectable, computed, inject, signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";

export interface SidechainRoute {
  triggerTrackId: string;
  targetTrackId: string;
}

/**
 * Project-level view of the engine's sidechain matrix.
 *
 * The mixer used to keep its own `sidechainMap` signal, so a route restored
 * into the audio graph by ProjectWorkspace was audible but invisible — the
 * chips still read "no sidechain". This service is the one place that both
 * mutates the engine and exposes the same routing to the UI and to the project
 * snapshot.
 */
@Injectable({ providedIn: "root" })
export class SidechainRoutingService {
  private readonly engine = inject(AudioEngineService);

  readonly routes = signal<SidechainRoute[]>(this.readEngine());

  /** targetTrackId → triggerTrackId, the shape the mixer chips render from. */
  readonly byTarget = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const route of this.routes()) {
      map[route.targetTrackId] = route.triggerTrackId;
    }
    return map;
  });

  routeFor(targetTrackId: string): string | null {
    return this.byTarget()[targetTrackId] ?? null;
  }

  /**
   * Route (or clear) one target. A target has at most one trigger, matching
   * the mixer chip: choosing a different source replaces the old pair rather
   * than layering two ducking feeds onto the same track.
   */
  setRoute(targetTrackId: string, triggerTrackId: string | null): void {
    if (!targetTrackId) return;
    const previous = this.routeFor(targetTrackId);
    if (previous === triggerTrackId) return;
    if (previous) this.disconnect(previous, targetTrackId);
    if (triggerTrackId && triggerTrackId !== targetTrackId) {
      this.connect(triggerTrackId, targetTrackId);
    }
  }

  /** Apply a whole saved matrix, tearing down the open project's routes first. */
  replaceAll(routes: readonly SidechainRoute[]): void {
    for (const current of this.readEngine()) {
      this.disconnect(current.triggerTrackId, current.targetTrackId);
    }
    const next: SidechainRoute[] = [];
    if (Array.isArray(routes)) {
      for (const route of routes) {
        if (
          !route ||
          typeof route.triggerTrackId !== "string" ||
          typeof route.targetTrackId !== "string" ||
          !route.triggerTrackId ||
          !route.targetTrackId ||
          route.triggerTrackId === route.targetTrackId
        ) {
          continue;
        }
        this.connect(route.triggerTrackId, route.targetTrackId);
        next.push({
          triggerTrackId: route.triggerTrackId,
          targetTrackId: route.targetTrackId,
        });
      }
    }
    this.routes.set(next);
  }

  clear(): void {
    this.replaceAll([]);
  }

  private connect(triggerTrackId: string, targetTrackId: string): void {
    this.engine.connectSidechain(triggerTrackId, targetTrackId);
    this.routes.update((list) => [
      ...list.filter((route) => route.targetTrackId !== targetTrackId),
      { triggerTrackId, targetTrackId },
    ]);
  }

  private disconnect(triggerTrackId: string, targetTrackId: string): void {
    this.engine.disconnectSidechain(triggerTrackId, targetTrackId);
    this.routes.update((list) =>
      list.filter(
        (route) =>
          !(
            route.triggerTrackId === triggerTrackId &&
            route.targetTrackId === targetTrackId
          ),
      ),
    );
  }

  private readEngine(): SidechainRoute[] {
    const read = (this.engine as Partial<AudioEngineService>)
      .getSidechainRouting;
    if (typeof read !== "function") return [];
    return read
      .call(this.engine)
      .filter(
        (route) =>
          route.triggerTrackId &&
          route.targetTrackId &&
          route.triggerTrackId !== route.targetTrackId,
      )
      .map((route) => ({
        triggerTrackId: route.triggerTrackId,
        targetTrackId: route.targetTrackId,
      }));
  }
}
