import {
  buildUploadObjectKey,
  isAllowedUploadMime,
  isConsistentUpload,
  publicUploadUrl,
  sanitizeUploadFilename,
  sniffUploadMime,
  storedUploadMime,
} from './upload-security';

const bytes = (...values: number[]) => Buffer.from(values);

describe('upload security', () => {
  it('rejects SVG and unknown types, and accepts the documented media set', () => {
    expect(isAllowedUploadMime('image/svg+xml')).toBe(false);
    expect(isAllowedUploadMime('application/x-msdownload')).toBe(false);
    expect(isAllowedUploadMime('audio/mpeg')).toBe(true);
    expect(isAllowedUploadMime('image/png')).toBe(true);
    expect(isAllowedUploadMime('application/pdf')).toBe(true);
    expect(
      isAllowedUploadMime(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBe(true);
    expect(isAllowedUploadMime('text/plain; charset=utf-8')).toBe(true);
  });

  it('sniffs the real container from magic bytes', () => {
    expect(
      sniffUploadMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    ).toBe('image/png');
    expect(sniffUploadMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe(
      'image/jpeg'
    );
    expect(sniffUploadMime(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(sniffUploadMime(bytes(0x50, 0x4b, 0x03, 0x04))).toBe(
      'application/zip'
    );
    expect(sniffUploadMime(Buffer.from('RIFFxxxxWAVEfmt '))).toBe('audio/wav');
    expect(sniffUploadMime(Buffer.from('OggS\x00\x02'))).toBe('audio/ogg');
    expect(sniffUploadMime(Buffer.from('fLaC\x00\x00'))).toBe('audio/flac');
    expect(sniffUploadMime(Buffer.from('ID3\x04\x00'))).toBe('audio/mpeg');
    expect(
      sniffUploadMime(Buffer.from('\x00\x00\x00\x18ftypM4A \x00\x00\x00\x00'))
    ).toBe('audio/mp4');
    expect(sniffUploadMime(Buffer.from('\x00\x00\x00\x18ftypisom\x00\x00\x00\x00'))).toBe(
      'video/mp4'
    );
    expect(sniffUploadMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).toBe(
      'video/webm'
    );
  });

  it('rejects a declared type that contradicts the bytes', () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(isConsistentUpload('audio/mpeg', sniffUploadMime(png))).toBe(false);
    expect(isConsistentUpload('image/png', sniffUploadMime(png))).toBe(true);
    expect(isConsistentUpload('application/pdf', sniffUploadMime(Buffer.from('%PDF-1.7')))).toBe(
      true
    );
    expect(
      isConsistentUpload(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sniffUploadMime(bytes(0x50, 0x4b, 0x03, 0x04))
      )
    ).toBe(true);
  });

  it('only accepts unsigned content when it was declared as text', () => {
    expect(isConsistentUpload('application/json', sniffUploadMime(Buffer.from('{"ok":true}')))).toBe(
      true
    );
    expect(isConsistentUpload('image/png', sniffUploadMime(Buffer.from('not a png')))).toBe(
      false
    );
    expect(isConsistentUpload('application/octet-stream', null)).toBe(false);
  });

  it('strips traversal, separators and control characters from names', () => {
    expect(sanitizeUploadFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeUploadFilename('..\\..\\cover art!.png')).toBe('cover_art_.png');
    expect(sanitizeUploadFilename('a\u0000b\u001fc.mp3')).toBe('abc.mp3');
    expect(sanitizeUploadFilename('   ')).toBe('file');
    expect(sanitizeUploadFilename('.hidden')).toBe('hidden');
  });

  it('builds an owner-scoped, unguessable key with a flat filename', () => {
    const key = buildUploadObjectKey(
      '42',
      '../../My Track (final).wav',
      'b6c1e0e2-aaaa-4bbb-8ccc-123456789abc',
      new Date(Date.UTC(2026, 0, 9))
    );
    expect(key).toBe(
      'uploads/42/2026/b6c1e0e2-aaaa-4bbb-8ccc-123456789abc/My_Track_(final).wav'
    );
    expect(key.startsWith('uploads/42/')).toBe(true);
    expect(key).not.toContain('..');
  });

  it('encodes public URLs once and never doubles the slash', () => {
    expect(
      publicUploadUrl('https://cdn.example.com/', 'uploads/42/2026/a/My Track.wav')
    ).toBe('https://cdn.example.com/uploads/42/2026/a/My%20Track.wav');
  });

  it('serves the sniffed type, not the client claim', () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(storedUploadMime('image/jpeg', sniffUploadMime(png))).toBe('image/png');
    expect(storedUploadMime('application/json', null)).toBe('application/json');
  });
});
