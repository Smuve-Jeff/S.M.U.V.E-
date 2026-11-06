import { Injectable, computed, signal } from "@angular/core";

export type SmartProductionFeature =
  | "stemSeparation"
  | "bpmDetection"
  | "keyDetection"
  | "vocalEnhancement"
  | "takeRanking";

export interface SmartProductionCapability {
  feature: SmartProductionFeature;
  label: string;
  status: "ready" | "unsupported";
  reason?: string;
}

@Injectable({ providedIn: "root" })
export class SmartProductionFoundationsService {
  private readonly backendConfigured = signal(false);
  private readonly busyFeatures = signal<Set<SmartProductionFeature>>(
    new Set(),
  );

  readonly capabilities = computed<SmartProductionCapability[]>(() => [
    {
      feature: "stemSeparation",
      label: "Stem Separation",
      status: "ready",
    },
    {
      // Tempo is measured on the device when audio is imported, so this half
      // of the old combined row never needed the analysis endpoint.
      feature: "bpmDetection",
      label: "BPM Detection",
      status: "ready",
      reason: "Measured locally when audio is imported",
    },
    {
      feature: "keyDetection",
      label: "Key Detection",
      status: this.backendConfigured() ? "ready" : "unsupported",
      reason: this.backendConfigured()
        ? undefined
        : "Requires server-side analysis endpoint",
    },
    {
      feature: "vocalEnhancement",
      label: "Vocal Enhancement",
      status: "unsupported",
      reason: "Backend model pipeline not configured",
    },
    {
      feature: "takeRanking",
      label: "Take Ranking",
      status: "unsupported",
      reason: "Awaiting backend scoring provider",
    },
  ]);

  setBackendConfigured(configured: boolean): void {
    this.backendConfigured.set(configured);
  }

  isBusy(feature: SmartProductionFeature): boolean {
    return this.busyFeatures().has(feature);
  }

  setBusy(feature: SmartProductionFeature, busy: boolean): void {
    this.busyFeatures.update((current) => {
      const next = new Set(current);
      if (busy) {
        next.add(feature);
      } else {
        next.delete(feature);
      }
      return next;
    });
  }
}
