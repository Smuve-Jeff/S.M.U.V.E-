import { buildZip } from './zip.util';

/** jsdom's Blob lacks .text()/.arrayBuffer() — read via FileReader. */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('buildZip', () => {
  it('produces a store-only ZIP with local headers, central directory and EOCD', async () => {
    const blob = buildZip([
      { name: 'take_1.wav', data: new TextEncoder().encode('WAVDATA-ONE') },
      { name: 'take_2.wav', data: new TextEncoder().encode('WAVDATA-TWO') },
    ]);

    expect(blob.type).toBe('application/zip');

    const text = await readBlobText(blob);
    // PK\x03\x04 local file header · PK\x01\x02 central directory ·
    // PK\x05\x06 end-of-central-directory record.
    expect(text).toContain('PK\u0003\u0004');
    expect(text).toContain('PK\u0001\u0002');
    expect(text).toContain('PK\u0005\u0006');

    expect(text).toContain('take_1.wav');
    expect(text).toContain('take_2.wav');
    expect(text).toContain('WAVDATA-ONE');
    expect(text).toContain('WAVDATA-TWO');
  });

  it('handles a single entry and an empty archive gracefully', async () => {
    const single = await readBlobText(
      buildZip([{ name: 'solo.wav', data: new TextEncoder().encode('X') }])
    );
    expect(single).toContain('PK\u0005\u0006');
    expect(single).toContain('solo.wav');

    const empty = await readBlobText(buildZip([]));
    expect(empty).toContain('PK\u0005\u0006');
  });
});
