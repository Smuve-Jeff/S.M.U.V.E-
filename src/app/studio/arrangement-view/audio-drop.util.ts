/**
 * Pure helpers for dropping audio files onto the arrangement. Kept out of the
 * component so the accept rule and the drop position can be tested without a
 * WebGL canvas or an AudioContext.
 */

const AUDIO_EXTENSIONS = /\.(wav|wave|mp3|ogg|oga|flac|m4a|aac|aiff?|opus)$/i;

/** Minimal shape of a dropped file (File satisfies it). */
export interface DroppedFileLike {
  name: string;
  type?: string;
}

/**
 * Accept audio by MIME type *or* extension: Android's file picker and several
 * desktop browsers report an empty `type` for .flac/.aiff, so trusting the MIME
 * alone silently refuses the files the artist most wants to import.
 */
export function isSupportedAudioFile(file: DroppedFileLike): boolean {
  if (!file?.name) return false;
  if (file.type?.startsWith("audio/")) return true;
  return AUDIO_EXTENSIONS.test(file.name);
}

/** Bar the drop lands on, from the world x of the drop point. */
export function dropBarFromWorldX(worldX: number, barWidth: number): number {
  const width = barWidth > 0 ? barWidth : 1;
  return Math.max(0, Math.round(worldX / width));
}

/** "Take 3 (bounced).wav" → "Take 3 (bounced)" for the new track name. */
export function droppedAudioName(fileName: string): string {
  const base = (fileName || "").replace(/\.[^.]+$/, "").trim();
  return base || "Imported audio";
}
