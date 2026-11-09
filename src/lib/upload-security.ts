/**
 * Upload safety rules, shared by the upload route and the storage service.
 *
 * A client-supplied MIME type is a claim, not evidence. Everything here is
 * pure and server-side so the route can reject a disguised file before it is
 * buffered into storage, and so the key a file is written under can be proven
 * to belong to one account.
 */

/** The shared `/api/upload` ceiling. Music masters use their own larger route. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const OPENXML_PREFIX = 'application/vnd.openxmlformats-officedocument.';

const normalizeMime = (value: unknown): string =>
  String(value ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();

/**
 * Media allowlist. SVG is deliberately absent: it can carry script and is
 * served from the public media domain, so it is not a safe "image" upload.
 */
export const isAllowedUploadMime = (value: unknown): boolean => {
  const mime = normalizeMime(value);
  if (!mime || mime === 'image/svg+xml') return false;
  return (
    mime.startsWith('image/') ||
    mime.startsWith('audio/') ||
    mime.startsWith('video/') ||
    mime === 'application/pdf' ||
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed' ||
    mime === 'application/json' ||
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    mime.startsWith(OPENXML_PREFIX)
  );
};

type UploadCategory =
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'zip'
  | 'text';

const categoryOf = (mime: string): UploadCategory | null => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed' ||
    mime.startsWith(OPENXML_PREFIX)
  ) {
    return 'zip';
  }
  if (
    mime === 'application/json' ||
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    mime.startsWith('text/')
  ) {
    return 'text';
  }
  return null;
};

const startsWithBytes = (
  buffer: Buffer,
  bytes: readonly number[],
  offset = 0
): boolean =>
  buffer.length >= offset + bytes.length &&
  bytes.every((byte, index) => buffer[offset + index] === byte);

const ascii = (buffer: Buffer, start: number, end: number): string =>
  buffer.subarray(start, end).toString('latin1');

const hasFtyp = (buffer: Buffer): boolean =>
  buffer.length >= 12 && ascii(buffer, 4, 8) === 'ftyp';

const ftypBrand = (buffer: Buffer): string =>
  buffer.length >= 12 ? ascii(buffer, 8, 12) : '';

/**
 * The content type the bytes actually are, or `null` when the format has no
 * reliable signature (plain text, JSON) or is not one this app accepts.
 */
export const sniffUploadMime = (buffer: Buffer): string | null => {
  if (!buffer || buffer.length < 4) return null;

  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png';
  if (ascii(buffer, 0, 4) === 'GIF8') return 'image/gif';
  if (
    ascii(buffer, 0, 4) === 'RIFF' &&
    ascii(buffer, 8, 12) === 'WEBP'
  )
    return 'image/webp';
  if (
    ascii(buffer, 4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(ftypBrand(buffer))
  )
    return 'image/avif';
  if (
    ascii(buffer, 4, 8) === 'ftyp' &&
    ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(
      ftypBrand(buffer)
    )
  )
    return 'image/heic';

  if (ascii(buffer, 0, 5) === '%PDF-') return 'application/pdf';
  if (startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) return 'application/zip';
  if (startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06])) return 'application/zip';
  if (startsWithBytes(buffer, [0x50, 0x4b, 0x07, 0x08])) return 'application/zip';

  if (ascii(buffer, 0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(buffer, 0, 4) === 'fLaC') return 'audio/flac';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WAVE')
    return 'audio/wav';
  if (ascii(buffer, 0, 3) === 'ID3') return 'audio/mpeg';

  if (startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';

  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    // ADTS AAC has a zero layer field; MPEG audio has any layer but zero.
    return (buffer[1] >> 1) & 0x03 ? 'audio/mpeg' : 'audio/aac';
  }

  if (hasFtyp) {
    const brand = ftypBrand(buffer);
    if (['M4A ', 'M4B ', 'm4a ', 'm4b '].includes(brand)) return 'audio/mp4';
    if (brand === 'qt  ') return 'video/quicktime';
    if (
      [
        'isom',
        'iso2',
        'iso3',
        'mp41',
        'mp42',
        'avc1',
        'dash',
        'MSNV',
      ].includes(brand)
    ) {
      return 'video/mp4';
    }
  }

  return null;
};

/**
 * Whether the declared type can be trusted for the bytes that arrived.
 *
 * A signature that contradicts the claim is always a rejection. Formats with
 * no signature are only accepted when the declaration is textual, so a binary
 * file cannot pass itself off as JSON or Markdown.
 */
export const isConsistentUpload = (
  declaredMime: unknown,
  detectedMime: string | null
): boolean => {
  const declared = normalizeMime(declaredMime);
  const declaredCategory = categoryOf(declared);
  if (!declaredCategory) return false;

  if (!detectedMime) return declaredCategory === 'text';

  const detectedCategory = categoryOf(normalizeMime(detectedMime));
  if (!detectedCategory) return false;
  return declaredCategory === detectedCategory;
};

/**
 * Strip every path, control and shell-hostile character from a client name.
 * The result is a single flat filename safe for an object key and a
 * `Content-Disposition` header, or `file` when nothing usable remains.
 */
const withoutControlCharacters = (value: string): string =>
  Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join('');

export const sanitizeUploadFilename = (value: unknown): string => {
  const base = withoutControlCharacters(String(value ?? ''))
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.{2,}/g, '.')
    .replace(/[^A-Za-z0-9._ ()-]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 120);
  return base || 'file';
};

const safeKeySegment = (value: unknown): string =>
  String(value ?? '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 80) || 'user';

/**
 * Owner-scoped, unguessable object key:
 * `uploads/<userId>/<year>/<uuid>/<safeName>`.
 *
 * The first segment is fixed so an ownership check can prove a key belongs to
 * an account by prefix, and the random segment stops a name from being
 * predictable across accounts.
 */
export const buildUploadObjectKey = (
  userId: unknown,
  filename: unknown,
  uploadId: string,
  now: Date = new Date()
): string =>
  [
    'uploads',
    safeKeySegment(userId),
    String(now.getUTCFullYear()),
    safeKeySegment(uploadId),
    sanitizeUploadFilename(filename),
  ].join('/');

/** Public URL for a stored key, with each segment encoded exactly once. */
export const publicUploadUrl = (publicDomain: string, key: string): string =>
  `${publicDomain.replace(/\/+$/, '')}/${key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

/**
 * The type to store and serve. The sniffed type wins; for text-like files that
 * have no signature, the declared type is used only after allowlist checks.
 */
export const storedUploadMime = (
  declaredMime: unknown,
  detectedMime: string | null
): string =>
  normalizeMime(detectedMime || declaredMime) || 'application/octet-stream';
