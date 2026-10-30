import type {
  ProjectBundle,
  SerializedAudioAsset,
} from "./project-workspace.service";

export type AudioIntegrityIssueReason =
  | "missing-reference"
  | "missing-asset"
  | "empty-asset";

export interface AudioIntegrityIssue {
  trackId: string;
  trackName: string;
  clipId: string;
  clipName: string;
  audioRefId: string | null;
  reason: AudioIntegrityIssueReason;
}

export interface ProjectAudioIntegrityReport {
  ok: boolean;
  audioClipCount: number;
  audioAssetCount: number;
  missingCount: number;
  issues: AudioIntegrityIssue[];
  /** Assets that no clip points at. Harmless, but useful when diagnosing bloat. */
  unusedAssetIds: string[];
}

/**
 * Verify every audio clip in a project points at audio that is actually in the
 * bundle.
 *
 * The project snapshot only adds an asset when an AudioBuffer is still resident
 * in the stem cache, so a clip whose take was never captured (or whose buffer
 * was evicted) would otherwise export as a silent clip and reopen looking
 * intact. The same check runs on import, before a broken backup replaces the
 * open session.
 */
export function inspectProjectAudioIntegrity(
  bundle: ProjectBundle,
): ProjectAudioIntegrityReport {
  const assets = new Map<string, SerializedAudioAsset>();
  for (const asset of bundle.audioAssets ?? []) {
    if (asset && typeof asset.id === "string" && !assets.has(asset.id)) {
      assets.set(asset.id, asset);
    }
  }

  const issues: AudioIntegrityIssue[] = [];
  const referenced = new Set<string>();
  let audioClipCount = 0;

  for (const track of bundle.tracks ?? []) {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    for (const clip of clips) {
      const isAudioClip =
        clip?.type === "audio" ||
        (typeof clip?.audioRefId === "string" &&
          clip.audioRefId.trim().length > 0);
      if (!isAudioClip) continue;
      audioClipCount += 1;

      const refId =
        typeof clip?.audioRefId === "string" && clip.audioRefId.trim()
          ? clip.audioRefId.trim()
          : typeof clip?.id === "string" && clip.id.trim()
            ? clip.id.trim()
            : "";
      if (refId) referenced.add(refId);

      const base = {
        trackId: typeof track?.id === "string" ? track.id : "",
        trackName:
          typeof track?.name === "string" && track.name.trim()
            ? track.name.trim()
            : "Untitled track",
        clipId: typeof clip?.id === "string" ? clip.id : "",
        clipName:
          typeof clip?.name === "string" && clip.name.trim()
            ? clip.name.trim()
            : typeof clip?.id === "string" && clip.id
              ? clip.id
              : "Untitled clip",
        audioRefId: refId || null,
      };

      if (!refId) {
        issues.push({ ...base, reason: "missing-reference" });
        continue;
      }
      const asset = assets.get(refId);
      if (!asset) {
        issues.push({ ...base, reason: "missing-asset" });
        continue;
      }
      if (!assetHasSamples(asset)) {
        issues.push({ ...base, reason: "empty-asset" });
      }
    }
  }

  return {
    ok: issues.length === 0,
    audioClipCount,
    audioAssetCount: assets.size,
    missingCount: issues.length,
    issues,
    unusedAssetIds: Array.from(assets.keys()).filter(
      (id) => !referenced.has(id),
    ),
  };
}

export type AudioIntegrityAction =
  | "import"
  | "export"
  | "save"
  | "autosave"
  | "cloud";

/** Human-readable failure used by the import/export/save call sites. */
export function describeAudioIntegrityFailure(
  report: ProjectAudioIntegrityReport,
  action: AudioIntegrityAction,
): string {
  if (report.ok) return "";
  const count = report.missingCount;
  const examples = report.issues
    .slice(0, 3)
    .map(
      (issue) =>
        `'${issue.clipName}' on ${issue.trackName}` +
        (issue.audioRefId ? ` (ref ${issue.audioRefId})` : ""),
    )
    .join(", ");
  const more = count > 3 ? ` and ${count - 3} more` : "";
  const verb = count === 1 ? "has" : "have";
  const prefix =
    action === "import"
      ? "Import blocked"
      : action === "export"
        ? "Export blocked"
        : action === "autosave"
          ? "Auto-save paused"
          : action === "cloud"
            ? "Cloud sync paused"
            : "Save blocked";
  const nextStep =
    action === "import"
      ? "Re-export a complete backup from the device that recorded the audio."
      : action === "export"
        ? "Re-record or remove the silent clips, then export again."
        : "Relink or remove the silent clips, then save again.";
  return `${prefix}: ${count} audio clip${count === 1 ? "" : "s"} ${verb} no matching take (${examples}${more}). ${nextStep}`;
}

function assetHasSamples(asset: SerializedAudioAsset): boolean {
  if (!Array.isArray(asset.channels) || asset.channels.length === 0) {
    return false;
  }
  if (!Number.isFinite(asset.frameCount) || asset.frameCount < 1) {
    return false;
  }
  return asset.channels.every(
    (channel) =>
      (Array.isArray(channel) || channel instanceof Float32Array) &&
      channel.length > 0,
  );
}
