import { Injectable } from '@angular/core';
import { CinemaEngine } from 'cinema-engine';
import type { VideoMetadata } from 'cinema-engine';

/**
 * Bridge between the studio app and the bundled `cinema-engine` package.
 *
 * The engine is consumed through the app's own build (see the `cinema-engine`
 * path alias in `tsconfig.json`), not as a built artefact on disk, so a deploy
 * compiles it with everything else and nothing has to be published first.
 *
 * Only the media-analysis surface is wired so far: it is the one part of the
 * engine that reads a real file instead of describing a look, and the studio
 * uses it to learn how long the take the operator just picked actually is.
 */
@Injectable({
  providedIn: 'root',
})
export class CinemaEngineService {
  private readonly engine = new CinemaEngine();

  /** The engine facade, for callers that need a surface this service skips. */
  get cinemaEngine(): CinemaEngine {
    return this.engine;
  }

  /**
   * Capture a poster frame from a picked file.
   *
   * The frame is taken 10% into the take rather than at 0, where a phone video
   * often opens on a black fade. Returns null when the host cannot decode the
   * file; the clip then renders exactly as it did before posters existed.
   */
  async capturePoster(
    file: File,
    timeoutMs = 5000
  ): Promise<{ url: string; width: number; height: number } | null> {
    try {
      const shot = await this.engine.captureThumbnail(file, {
        at: 0.1,
        timeIsFraction: true,
        maxWidth: 240,
        maxHeight: 135,
        timeoutMs,
      });
      return shot?.url ? { url: shot.url, width: shot.width, height: shot.height } : null;
    } catch {
      return null;
    }
  }

  /**
   * Measure a picked file.
   *
   * Returns null rather than throwing: a codec this WebView cannot decode is a
   * normal outcome on a phone, and the caller keeps the preset-length fallback
   * the clip was already placed with. `timeoutMs` bounds the wait, because a
   * file that never reports metadata must not stall the import.
   */
  async measureVideo(file: File, timeoutMs = 4000): Promise<VideoMetadata | null> {
    try {
      const metadata = await this.engine.extractVideoMetadata(file, timeoutMs);
      // A duration of 0 means the browser could not read the media header; it
      // is not a real length and must not overwrite the fallback.
      return metadata && metadata.duration > 0 ? metadata : null;
    } catch {
      return null;
    }
  }
}
