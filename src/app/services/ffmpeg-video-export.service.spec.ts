import {
  FfmpegVideoExportService,
  buildMp4Args,
  validateMp4Bytes,
  validateMp4Blob,
  type FfmpegLike,
} from './ffmpeg-video-export.service';
import { TestBed } from '@angular/core/testing';
import { LoggingService } from './logging.service';

/** Build a minimal but structurally valid MP4 byte sequence. */
function fakeMp4(brand = 'isom'): Uint8Array {
  const enc = new TextEncoder();
  const box = (type: string, payload = '') => {
    const body = enc.encode(type + payload);
    const size = body.length + 4;
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, size);
    const out = new Uint8Array(size + 4);
    out.set(header);
    out.set(body, 4);
    return out;
  };
  const parts = [
    box('ftyp', brand + '\0\0\0\0isomiso2'),
    box('moov', 'tracks'),
    box('mdat', 'frame-bytes'),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function fakeFfmpeg(output: Uint8Array, exitCode = 0): FfmpegLike & { calls: string[][]; written: Map<string, Uint8Array> } {
  const written = new Map<string, Uint8Array>();
  const calls: string[][] = [];
  return {
    loaded: true,
    calls,
    written,
    load: jest.fn(async () => true),
    writeFile: jest.fn(async (path: string, data: Uint8Array) => { written.set(path, data); }),
    exec: jest.fn(async (args: string[]) => { calls.push(args); return exitCode; }),
    readFile: jest.fn(async () => output),
    deleteFile: jest.fn(async (path: string) => { written.delete(path); }),
    on: jest.fn(),
  } as unknown as FfmpegLike & { calls: string[][]; written: Map<string, Uint8Array> };
}

describe('validateMp4Bytes (export-validity)', () => {
  it('accepts a structurally valid MP4 with ftyp/moov/mdat', () => {
    const result = validateMp4Bytes(fakeMp4());
    expect(result.valid).toBe(true);
    expect(result.brand).toBe('isom');
    expect(result.hasMoov).toBe(true);
    expect(result.hasMdat).toBe(true);
  });

  it('rejects a WebM/EBML capture masquerading as an export', () => {
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, ...new TextEncoder().encode('webm')]);
    const result = validateMp4Bytes(webm);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/WebM/);
  });

  it('rejects truncated output with no moov box', () => {
    const bytes = fakeMp4().slice(0, 24);
    expect(validateMp4Bytes(bytes).valid).toBe(false);
  });

  it('rejects empty and tiny output', () => {
    expect(validateMp4Bytes(new Uint8Array(0)).valid).toBe(false);
    expect(validateMp4Bytes(new Uint8Array([1, 2, 3])).valid).toBe(false);
  });

  it('validateMp4Blob round-trips a Blob', async () => {
    const blob = new Blob([fakeMp4() as BlobPart], { type: 'video/mp4' });
    await expect(validateMp4Blob(blob)).resolves.toMatchObject({ valid: true, brand: 'isom' });
  });
});

describe('buildMp4Args', () => {
  it('encodes libx264 + AAC with faststart', () => {
    const args = buildMp4Args();
    expect(args).toContain('libx264');
    expect(args).toContain('yuv420p');
    expect(args).toContain('aac');
    expect(args).toContain('+faststart');
    expect(args[args.length - 1]).toBe('output.mp4');
  });
});

describe('FfmpegVideoExportService', () => {
  let svc: FfmpegVideoExportService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FfmpegVideoExportService,
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    });
    svc = TestBed.inject(FfmpegVideoExportService);
  });

  it('transcodes a capture to a validated MP4 blob via a fake FFmpeg', async () => {
    const mp4 = fakeMp4();
    const ffmpeg = fakeFfmpeg(mp4);
    svc.ffmpegLoader = async () => ({
      ffmpeg,
      fetchFile: async (input: Blob) => new Uint8Array(await input.arrayBuffer()),
    });

    const webm = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], { type: 'video/webm' });
    const out = await svc.transcodeToMp4(webm);

    expect(out.type).toBe('video/mp4');
    expect(out.size).toBe(mp4.length);
    expect(ffmpeg.exec).toHaveBeenCalledWith(expect.arrayContaining(['libx264', 'aac']));
    // In-memory FS is cleaned up after the encode.
    expect(ffmpeg.written.size).toBe(0);
    await expect(validateMp4Blob(out)).resolves.toMatchObject({ valid: true });
  });

  it('throws when FFmpeg output fails MP4 validation', async () => {
    const ffmpeg = fakeFfmpeg(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9, 9, 9, 9]));
    svc.ffmpegLoader = async () => ({
      ffmpeg,
      fetchFile: async () => new Uint8Array([1, 2, 3]),
    });
    await expect(svc.transcodeToMp4(new Blob(['x']))).rejects.toThrow(/invalid MP4/);
  });

  it('throws on a non-zero FFmpeg exit code', async () => {
    const ffmpeg = fakeFfmpeg(fakeMp4(), 1);
    svc.ffmpegLoader = async () => ({ ffmpeg, fetchFile: async () => new Uint8Array([1]) });
    await expect(svc.transcodeToMp4(new Blob(['x']))).rejects.toThrow(/exited with code 1/);
  });

  it('refuses an empty capture without loading FFmpeg', async () => {
    const loader = jest.fn();
    svc.ffmpegLoader = loader;
    await expect(svc.transcodeToMp4(new Blob([]))).rejects.toThrow(/no bytes/);
    expect(loader).not.toHaveBeenCalled();
  });
});
