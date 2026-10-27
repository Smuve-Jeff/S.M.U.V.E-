/**
 * What to tell the artist when the microphone is not available.
 *
 * The old banner said one thing for both states — "Enable mic permission in
 * your browser settings, then tap REC again". That advice is wrong half the
 * time: after a *dismissed* prompt the next tap re-prompts (nothing to change in
 * settings), and after a *hard block* the next tap returns `NotAllowedError`
 * instantly without ever prompting again, so "tap REC again" can never work.
 *
 * Pure, so both copies can be pinned without a browser.
 */
export type MicPermissionState = "granted" | "prompt" | "denied" | "unknown";

export interface MicPermissionNotice {
  /** Banner heading. */
  title: string;
  /** One line explaining what happened. */
  detail: string;
  /** Ordered recovery steps; empty when there is nothing to walk through. */
  steps: readonly string[];
  /** Whether re-asking can produce a prompt (true when not hard-blocked). */
  canRetry: boolean;
  /** Whether the fix lives in browser settings rather than in the app. */
  needsBrowserSettings: boolean;
}

export function micPermissionNotice(
  state: MicPermissionState,
): MicPermissionNotice {
  switch (state) {
    case "denied":
      return {
        title: "Microphone blocked for this site",
        detail:
          "The browser will not prompt again until the block is cleared — tapping REC just fails silently.",
        steps: [
          "Open the site settings from the icon at the start of the address bar",
          "Set Microphone to Allow",
          "Reload this page, then tap REC",
        ],
        canRetry: true,
        needsBrowserSettings: true,
      };
    case "prompt":
      return {
        title: "Microphone permission needed",
        detail:
          "The request was dismissed before it was answered, so nothing is blocked yet.",
        steps: ["Tap REC again and choose Allow when the browser asks"],
        canRetry: true,
        needsBrowserSettings: false,
      };
    case "granted":
      return {
        title: "Microphone allowed",
        detail: "The browser has granted microphone access for this site.",
        steps: [],
        canRetry: false,
        needsBrowserSettings: false,
      };
    case "unknown":
    default:
      return {
        title: "Microphone unavailable",
        detail:
          "This browser did not report a microphone permission state, so the request has to be made again.",
        steps: ["Tap REC to ask again, and check the browser's site settings if it stays silent"],
        canRetry: true,
        needsBrowserSettings: false,
      };
  }
}
