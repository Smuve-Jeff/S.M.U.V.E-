/**
 * TPDF dither for bit-depth reduction.
 *
 * Quantising a float master straight to 16/24-bit turns low-level detail into
 * correlated truncation distortion — the gritty tail on fades and reverb that
 * disappears when the same material is played from the float render. A
 * triangular (TPDF) noise of one LSB peak-to-peak decorrelates the error
 * without adding a DC offset, which is the standard delivery choice.
 *
 * This is applied *only* where the sample rate is unchanged and the depth is
 * being reduced. Float exports and freeze bounces stay untouched.
 */
export function tpdfDither(sample: number, bitDepth: 16 | 24): number {
  const lsb = 1 / (1 << (bitDepth - 1));
  return sample + (Math.random() - Math.random()) * lsb;
}

/** Round a dithered float sample to the PCM integer for its depth. */
export function quantizeDithered(sample: number, bitDepth: 16 | 24): number {
  const max = (1 << (bitDepth - 1)) - 1;
  const min = -(1 << (bitDepth - 1));
  const dithered = tpdfDither(sample, bitDepth);
  const scaled = Math.round(
    dithered * (bitDepth === 16 ? 0x7fff : 0x7fffff),
  );
  return Math.max(min, Math.min(max, scaled));
}
