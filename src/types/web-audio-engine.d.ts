/**
 * Test-only rendering engine used by the retained-master audio test. It
 * implements enough of Web Audio in JavaScript to render samples in Node,
 * where jsdom has no native OfflineAudioContext.
 */
declare module "web-audio-engine" {
  export const OfflineAudioContext: any;
}
