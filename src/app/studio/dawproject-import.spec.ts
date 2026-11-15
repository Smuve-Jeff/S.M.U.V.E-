import { deflateRawSync, inflateRawSync } from "zlib";
import {
  importDawprojectArchive,
  parseDawprojectXml,
} from "./dawproject-import";

/** jsdom does not expose the platform inflate stream; Node's zlib stands in. */
const nodeInflate = async (data: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(inflateRawSync(data));

/** Representative Bitwig-style file: beats lanes, db volume, device, extras. */
const BITWIG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project version="1.0">
  <Application name="Bitwig Studio" version="5.3.2"/>
  <Transport>
    <Tempo value="174" unit="bpm"/>
    <TimeSignature numerator="4" denominator="4"/>
  </Transport>
  <Structure>
    <Track contentType="notes" loaded="true" id="t-bass" name="Bass" color="#ff5533">
      <Channel role="regular" solo="false">
        <Devices>
          <BuiltinDevice deviceName="Polymer" deviceRole="instrument" loaded="true"/>
        </Devices>
        <Mute value="false"/>
        <Pan value="-0.2" unit="normalized"/>
        <Volume value="0.8" unit="linear"/>
      </Channel>
    </Track>
    <Track contentType="audio" loaded="true" id="t-break" name="Break">
      <Channel role="regular" solo="false">
        <Mute value="false"/>
        <Pan value="0" unit="normalized"/>
        <Volume value="-6" unit="db"/>
      </Channel>
    </Track>
  </Structure>
  <Arrangement id="arrangement" name="Arr">
    <Lanes id="arr_lanes" timeUnit="beats">
      <Lanes id="lanes-t-bass" track="t-bass" timeUnit="beats">
        <Clips>
          <Clip time="0" duration="4" name="Bass A">
            <Notes>
              <Note time="0" duration="1" channel="0" key="36" vel="0.9"/>
              <Note time="2" duration="0.5" channel="0" key="38" vel="0.7"/>
            </Notes>
          </Clip>
        </Clips>
      </Lanes>
      <Lanes id="lanes-t-break" track="t-break" timeUnit="beats">
        <Clips>
          <Clip time="4" duration="8" name="Break">
            <Audio id="audio-1" duration="7.27" channels="2" sampleRate="44100" timeUnit="seconds">
              <File path="audio/break.wav"/>
            </Audio>
          </Clip>
        </Clips>
      </Lanes>
    </Lanes>
    <TempoAutomation><Points/></TempoAutomation>
  </Arrangement>
  <Scenes><Scene/></Scenes>
</Project>`;

/** Sparse file: no transport, no channel, seconds lanes, unnamed clip. */
const SPARSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project version="1.0">
  <Application name="Other" version="1"/>
  <Structure>
    <Track id="t1" name="Piano"/>
  </Structure>
  <Arrangement id="a" name="A">
    <Lanes id="l" timeUnit="seconds">
      <Lanes track="t1" timeUnit="seconds">
        <Clips>
          <Clip time="2" duration="4">
            <Notes>
              <Note time="0" duration="2" channel="0" key="60" vel="1"/>
            </Notes>
          </Clip>
        </Clips>
      </Lanes>
    </Lanes>
  </Arrangement>
</Project>`;

function buildArchive(
  entries: Array<{ name: string; data: Uint8Array }>,
): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const stored = deflateRawSync(entry.data);
    const local = new Uint8Array(30 + nameBytes.length + stored.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, stored.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(stored, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, stored.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const concat = (parts: Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let pos = 0;
    for (const part of parts) {
      out.set(part, pos);
      pos += part.length;
    }
    return out;
  };
  const centralDir = concat(centralParts);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDir.length, true);
  ev.setUint32(16, offset, true);
  return concat([...localParts, centralDir, eocd]);
}

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("dawproject-import", () => {
  it("maps a Bitwig-style file onto tracks, clips, notes and mix", () => {
    const { project, warnings } = parseDawprojectXml(BITWIG_XML);

    expect(project.tempo).toBe(174);
    expect(project.numerator).toBe(4);
    expect(project.tracks).toHaveLength(2);

    const bass = project.tracks[0];
    expect(bass.name).toBe("Bass");
    expect(bass.type).toBe("midi");
    expect(bass.color).toBe("#ff5533");
    expect(bass.gain).toBe(0.8);
    expect(bass.pan).toBe(-0.2);
    expect(bass.instrumentName).toBe("Polymer");
    expect(bass.clips).toHaveLength(1);
    expect(bass.clips[0]).toMatchObject({ start: 0, length: 1, name: "Bass A" });
    expect(bass.notes).toEqual([
      expect.objectContaining({ step: 0, length: 4, midi: 36, velocity: 0.9 }),
      expect.objectContaining({ step: 8, length: 2, midi: 38, velocity: 0.7 }),
    ]);

    const drums = project.tracks[1];
    expect(drums.type).toBe("audio");
    expect(drums.gain).toBeCloseTo(0.5012, 4);
    expect(drums.clips[0]).toMatchObject({ start: 1, length: 2 });
    expect(project.audio.map((entry) => entry.path)).toEqual([
      "audio/break.wav",
    ]);

    expect(warnings.join(" ")).toMatch(/Tempo automation/);
    expect(warnings.join(" ")).toMatch(/scenes/i);
  });

  it("tolerates sparse files with seconds lanes and missing sections", () => {
    const { project, warnings } = parseDawprojectXml(SPARSE_XML);

    expect(project.tempo).toBe(120);
    expect(project.tracks[0].gain).toBe(1);
    // 2 s at 120 bpm = beat 4 = bar 1; 4 s = 8 beats = 2 bars.
    expect(project.tracks[0].clips[0]).toMatchObject({ start: 1, length: 2 });
    expect(project.tracks[0].notes[0]).toMatchObject({ step: 16, midi: 60 });
    expect(warnings).toEqual([]);
  });

  it("imports a full archive and joins the embedded audio", async () => {
    const wav = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    const archive = buildArchive([
      { name: "project.xml", data: text(BITWIG_XML) },
      { name: "metadata.xml", data: text("<MetaData/>") },
      { name: "audio/break.wav", data: wav },
    ]);

    const { project, warnings } = await importDawprojectArchive(
      archive,
      nodeInflate,
    );

    expect(project.tracks).toHaveLength(2);
    expect(project.audio).toHaveLength(1);
    expect(project.audio[0].data).toEqual(wav);
    expect(warnings.join(" ")).toMatch(/Tempo automation/);
  });

  it("warns instead of failing when referenced audio was not embedded", async () => {
    const archive = buildArchive([
      { name: "project.xml", data: text(BITWIG_XML) },
    ]);

    const { project, warnings } = await importDawprojectArchive(
      archive,
      nodeInflate,
    );

    expect(project.audio).toHaveLength(0);
    expect(project.tracks[1].clips[0].audioId).toBeUndefined();
    expect(warnings.join(" ")).toMatch(/not embedded/);
  });

  it("rejects files without project.xml and files that are not XML", async () => {
    const noXml = buildArchive([{ name: "readme.txt", data: text("hi") }]);
    await expect(importDawprojectArchive(noXml, nodeInflate)).rejects.toThrow(
      /No project\.xml/,
    );
    expect(() => parseDawprojectXml("<Project><oops")).toThrow(
      /not valid XML/,
    );
    expect(() => parseDawprojectXml("<Song/>")).toThrow(/no Project root/i);
  });
});
