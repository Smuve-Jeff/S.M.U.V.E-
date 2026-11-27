/**
 * Compact wire format for one PCM channel. Number arrays made a three-minute
 * stereo take hundreds of megabytes of JSON; raw Float32 bytes in base64 are
 * roughly a third of that and preserve the exact samples.
 *
 * The bytes are explicitly little-endian so a snapshot written on one platform
 * restores sample-for-sample on another.
 */
export const FLOAT32_CHANNEL_PREFIX = "f32b64:";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeFloat32Channel(channel: Float32Array): string {
  const bytes = new Uint8Array(channel.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < channel.length; index++) {
    view.setFloat32(index * 4, channel[index], true);
  }
  return FLOAT32_CHANNEL_PREFIX + bytesToBase64(bytes);
}

export function decodeFloat32Channel(encoded: string): Float32Array {
  if (!encoded.startsWith(FLOAT32_CHANNEL_PREFIX)) {
    throw new Error("Unknown audio channel encoding.");
  }
  const bytes = base64ToBytes(
    encoded.slice(FLOAT32_CHANNEL_PREFIX.length),
  );
  if (bytes.byteLength % 4 !== 0) {
    throw new Error("Audio channel byte length is not a whole Float32 sample count.");
  }
  const samples = new Float32Array(bytes.byteLength / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < samples.length; index++) {
    samples[index] = view.getFloat32(index * 4, true);
  }
  return samples;
}
