import { buildZip } from "./zip.util";
import { importDawprojectArchive } from "./dawproject-import";

/**
 * Third-party serializer shapes, locked as regressions.
 *
 * Derived from an XSD-valid file produced by the independent dawproject-py
 * serializer (seconds lanes, dB numbers stamped unit="linear", FX device
 * chains, mixer master tracks, per-clip contentTimeUnit, tempo automation).
 * The full third-party file is validated locally, not committed; this spec
 * keeps the minimal shapes that broke the importer.
 */
const THIRD_PARTY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project version="1.0">
  <Application name="ThirdPartyValidator" version="1.0"/>
  <Transport>
    <Tempo value="120" unit="bpm"/>
  </Transport>
  <Structure>
    <Track name="Master" id="t-master">
      <Channel role="master">
        <Volume value="1.0" unit="linear"/>
      </Channel>
    </Track>
    <Track name="TP Kick" id="t-kick" contentType="audio">
      <Channel role="regular">
        <Devices>
          <Equalizer deviceRole="audioFX" deviceName="TP-EQ"/>
          <BuiltinDevice deviceRole="instrument" deviceName="TP-808"/>
        </Devices>
        <Pan value="-0.2" unit="normalized"/>
        <Volume value="-6.0" unit="linear"/>
      </Channel>
    </Track>
    <Track name="TP Bass" id="t-bass" contentType="notes">
      <Channel role="regular">
        <Volume value="0.8" unit="linear"/>
      </Channel>
    </Track>
  </Structure>
  <Arrangement>
    <Lanes timeUnit="seconds">
      <Clips track="t-kick">
        <Clip time="0.0" duration="2.0" contentTimeUnit="seconds">
          <Audio id="a-kick" duration="2.0">
            <File path="tp-kick.wav"/>
          </Audio>
        </Clip>
      </Clips>
      <Clips track="t-bass" timeUnit="beats">
        <Clip time="0.0" duration="2.0" contentTimeUnit="beats">
          <Notes>
            <Note time="0.75" duration="0.25" key="38" vel="0.7"/>
          </Notes>
        </Clip>
      </Clips>
    </Lanes>
    <TempoAutomation timeUnit="beats" unit="bpm">
      <RealPoint time="0.0" value="128.5"/>
      <RealPoint time="8.0" value="132.0"/>
    </TempoAutomation>
  </Arrangement>
</Project>`;

async function importXml(xml: string) {
  const blob = buildZip([
    { name: "project.xml", data: new TextEncoder().encode(xml) },
    // Parse-level join only needs the entry present; decoding is materialize.
    { name: "tp-kick.wav", data: new Uint8Array([82, 73, 70, 70]) },
  ]);
  return importDawprojectArchive(
    new Uint8Array(await blob.arrayBuffer()),
  );
}

describe("dawproject third-party shapes", () => {
  it("reads flat Clips, dB-as-linear volumes, FX chains and master tracks", async () => {
    const { project, warnings } = await importXml(THIRD_PARTY_XML);

    // Mixer routing tracks never become silent MIDI channels.
    expect(project.tracks.map((t) => t.name)).toEqual([
      "TP Kick",
      "TP Bass",
    ]);
    expect(warnings.join(" ")).toMatch(/Master.*master track/);

    const kick = project.tracks[0];
    expect(kick.type).toBe("audio");
    // -6 dB stamped as linear is still -6 dB.
    expect(kick.gain).toBeCloseTo(0.5012, 3);
    expect(kick.pan).toBeCloseTo(-0.2, 6);
    // Only instrument-role devices lend their name.
    expect(kick.instrumentName).toBe("TP-808");
    expect(kick.clips).toHaveLength(1);
    expect(kick.clips[0].audioId).toBeDefined();

    // Beats content under a seconds lane keeps beats timing.
    const bass = project.tracks[1];
    expect(bass.notes).toHaveLength(1);
    expect(bass.notes[0]).toMatchObject({ step: 3, midi: 38 });
    expect(bass.notes[0].velocity).toBeCloseTo(0.7, 6);
    expect(bass.notes[0].length).toBeCloseTo(1, 6);
  });

  it("adopts the first tempo-automation point and says so", async () => {
    const { project, warnings } = await importXml(THIRD_PARTY_XML);

    expect(project.tempo).toBe(128.5);
    expect(warnings.join(" ")).toMatch(
      /first point \(128\.5 BPM\) instead of the header tempo/,
    );
  });
});
