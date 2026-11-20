import { canEncodeVideo } from 'mediabunny';

/**
 * How this host can write a transparent WebM.
 *
 * `frame-locked` uses Mediabunny's VP9 alpha writer: every slot is encoded at
 * its requested timestamp, so a slow CGI frame cannot drop cadence.
 * `real-time` is the older MediaRecorder canvas capture. It keeps alpha but
 * lets render cost decide the file's frame rate.
 */
export type AlphaExportSupport = 'checking' | 'frame-locked' | 'real-time' | 'unsupported';

/**
 * Safari plays VP9 WebM but ignores its alpha plane. `canPlayType` cannot
 * report this because the VP9 codec string has no alpha field, so the user
 * agent is the only reliable up-front signal. A runtime decode probe would be
 * more precise, but it would make every editor open asynchronously for a
 * limitation that is already known by engine.
 */
export function isSafariWithoutWebmAlpha(userAgent: string): boolean {
  const agent = userAgent || '';
  if (!/Safari\//i.test(agent)) return false;
  // Every other Chromium/Firefox/Opera engine also carries a Safari token.
  return !/Chrome\/|Chromium\/|CriOS\/|Edg\/|EdgiOS\/|OPR\/|OPiOS\/|Firefox\/|FxiOS\//i.test(
    agent,
  );
}

/** True when MediaRecorder can capture a canvas WebM track. */
export function hasAlphaMediaRecorder(): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return false;
  return [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ].some((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * Pick the best transparent path available before the operator arms the mode.
 * The Mediabunny probe is asynchronous because it asks WebCodecs whether VP9
 * alpha is encodable; the MediaRecorder probe is synchronous and remains the
 * fallback on hosts where the frame-locked writer is unavailable.
 */
export async function detectAlphaExportSupport(
  width: number,
  height: number,
  fps: number,
): Promise<AlphaExportSupport> {
  const userAgent =
    typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (isSafariWithoutWebmAlpha(userAgent)) return 'unsupported';

  try {
    const frameLocked = await canEncodeVideo('vp9', {
      width: Math.max(2, Math.round(width)),
      height: Math.max(2, Math.round(height)),
      frameRate: Math.max(1, Math.round(fps)),
      alpha: 'keep',
    });
    if (frameLocked) return 'frame-locked';
  } catch {
    // A host can expose WebCodecs but still reject the alpha probe. The
    // MediaRecorder check below decides whether there is a usable fallback.
  }

  return hasAlphaMediaRecorder() ? 'real-time' : 'unsupported';
}
