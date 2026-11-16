/**
 * An MP4 header shaped like the ones MediaMTX finalises: `ftyp`, a `moov` whose
 * `mvhd` carries the real duration, then an `mdat`. No media, but enough to
 * exercise anything that reads the container.
 */
export function mp4Header(seconds, { timescale = 1000, version = 0 } = {}) {
  const mvhd = Buffer.alloc(version === 1 ? 120 : 108);
  mvhd.writeUInt32BE(mvhd.length, 0);
  mvhd.write("mvhd", 4, "latin1");
  mvhd.writeUInt8(version, 8);
  if (version === 1) {
    mvhd.writeBigUInt64BE(0n, 12);
    mvhd.writeBigUInt64BE(0n, 20);
    mvhd.writeUInt32BE(timescale, 28);
    mvhd.writeBigUInt64BE(BigInt(Math.round(seconds * timescale)), 32);
  } else {
    mvhd.writeUInt32BE(0, 12);
    mvhd.writeUInt32BE(0, 16);
    mvhd.writeUInt32BE(timescale, 20);
    mvhd.writeUInt32BE(Math.round(seconds * timescale), 24);
  }
  const moov = Buffer.alloc(8 + mvhd.length);
  moov.writeUInt32BE(moov.length, 0);
  moov.write("moov", 4, "latin1");
  mvhd.copy(moov, 8);
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write("ftyp", 4, "latin1");
  ftyp.write("isommp42", 8, "latin1");
  const mdat = Buffer.alloc(16);
  mdat.writeUInt32BE(16, 0);
  mdat.write("mdat", 4, "latin1");
  return Buffer.concat([ftyp, moov, mdat]);
}
