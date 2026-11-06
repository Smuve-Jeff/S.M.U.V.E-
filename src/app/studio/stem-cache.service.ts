import { Injectable } from "@angular/core";
import type { Stems } from "../services/stem-separation.service";

/** One file's separated stems, kept so re-opening the splitter is instant. */
export interface StemCacheEntry {
  key: string;
  fileName: string;
  source: AudioBuffer;
  stems: Stems;
  bytes: number;
}

/**
 * Holds separated stems for the lifetime of the Studio rather than a single
 * surface, so switching between arrangement, mixer and the rest does not throw
 * away seconds of DSP. Closing the Studio still releases everything.
 *
 * Stems cost about 85 MB per stereo stem-minute, so only the newest results
 * live here, under a byte budget: a few short files, or one long one.
 */
@Injectable()
export class StemCacheService {
  private readonly entries: StemCacheEntry[] = [];
  private budgetBytes = 600 * 1024 * 1024;

  get size(): number {
    return this.entries.length;
  }

  get mostRecent(): StemCacheEntry | null {
    return this.entries[0] ?? null;
  }

  /** Identity of the file itself, so an edited or different file misses. */
  keyFor(file: Pick<File, "type" | "name" | "size" | "lastModified">): string {
    return `${file.type}:${file.name}:${file.size}:${file.lastModified}`;
  }

  /** Oldest-first recency: a hit jumps to the front, so re-use is cheap. */
  take(key: string): StemCacheEntry | null {
    const index = this.entries.findIndex((entry) => entry.key === key);
    if (index < 0) return null;
    const [entry] = this.entries.splice(index, 1);
    this.entries.unshift(entry);
    return entry;
  }

  remember(
    key: string,
    fileName: string,
    source: AudioBuffer,
    stems: Stems,
  ): void {
    const existing = this.entries.findIndex((entry) => entry.key === key);
    if (existing >= 0) this.entries.splice(existing, 1);
    const bytes =
      this.audioBufferBytes(source) +
      Object.values(stems).reduce(
        (total, stem) => total + this.audioBufferBytes(stem),
        0,
      );
    this.entries.unshift({ key, fileName, source, stems, bytes });
    let total = this.entries.reduce((sum, entry) => sum + entry.bytes, 0);
    while (total > this.budgetBytes && this.entries.length > 1) {
      const evicted = this.entries.pop();
      if (!evicted) break;
      total -= evicted.bytes;
    }
  }

  private audioBufferBytes(buffer: AudioBuffer): number {
    return buffer.numberOfChannels * buffer.length * 4;
  }
}
