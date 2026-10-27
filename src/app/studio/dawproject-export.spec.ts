import {
  buildDawproject,
  buildDawprojectXml,
  xmlId,
  type DawprojectProject,
} from "./dawproject-export";

function makeProject(overrides: Partial<DawprojectProject> = {}): DawprojectProject {
  return {
    name: "Session",
    tempo: 128,
    numerator: 4,
    denominator: 4,
    tracks: [
      {
        id: "track_midi",
        name: "Bass & Lead",
        type: "midi",
        color: "#E11D48",
        instrumentName: "subtractive-elite",
        gain: 0.8,
        pan: -0.25,
        muted: false,
        soloed: true,
        notes: [
          { step: 0, length: 2, midi: 36, velocity: 0.9 },
          // Bar 3, step 4 → inside the second clip.
          { step: 36, length: 4, midi: 43, velocity: 0.5 },
        ],
        clips: [
          { name: "Verse", start: 0, length: 2 },
          { name: "Hook", start: 2, length: 2 },
        ],
      },
      {
        id: "track_audio",
        name: "Vocal",
        type: "audio",
        gain: 1,
        pan: 0,
        muted: true,
        soloed: false,
        notes: [],
        clips: [
          {
            name: "Take 1",
            start: 0,
            length: 2,
            audioId: "clip_vox_1",
          },
        ],
      },
    ],
    audio: [
      {
        id: "clip_vox_1",
        path: "audio/clip_vox_1.wav",
        data: new Uint8Array([1, 2, 3, 4]),
      },
    ],
    appVersion: "2.0.0",
    ...overrides,
  };
}

describe("DAWproject export", () => {
  it("writes project, application and transport exactly as the schema orders them", () => {
    const xml = buildDawprojectXml(makeProject());

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<Project version="1.0">');
    expect(xml).toContain('<Application name="S.M.U.V.E." version="2.0.0"/>');
    expect(xml).toContain('<Tempo value="128" unit="bpm"/>');
    expect(xml).toContain(
      '<TimeSignature numerator="4" denominator="4"/>',
    );
    expect(xml.indexOf("<Application")).toBeLessThan(xml.indexOf("<Transport"));
    expect(xml.indexOf("<Structure>")).toBeLessThan(xml.indexOf("<Arrangement"));
  });

  it("names and colours tracks as attributes (they are not child elements)", () => {
    const xml = buildDawprojectXml(makeProject());

    expect(xml).toContain(
      '<Track contentType="notes" loaded="true" id="track_track_midi" name="Bass &amp; Lead" color="#E11D48">',
    );
    expect(xml).not.toContain("<Name>");
    expect(xml).toContain('contentType="audio"');
  });

  it("orders channel children Devices → Mute → Pan → Volume", () => {
    const xml = buildDawprojectXml(makeProject());
    const channel = xml.slice(xml.indexOf("<Channel"), xml.indexOf("</Channel>"));
    const order = ["<Devices>", "<Mute", "<Pan", "<Volume"].map((tag) =>
      channel.indexOf(tag),
    );

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(channel).toContain('role="regular" solo="true"');
    expect(channel).toContain('<Mute value="false"/>');
    expect(channel).toContain('<Pan value="-0.25" unit="normalized"/>');
  });

  it("converts bars and steps to beats and keeps note times clip-relative", () => {
    const xml = buildDawprojectXml(makeProject());

    // Clip at bar 2 → beat 8; two bars → 8 beats.
    expect(xml).toContain('time="8" duration="8" name="Hook"');
    // Note at step 36 inside a clip starting at bar 2 (step 32) → beat 1.
    expect(xml).toContain(
      '<Note time="1" duration="1" channel="0" key="43" vel="0.500"/>',
    );
    // A note before the clip's window is not written into it.
    const hook = xml.slice(xml.indexOf('name="Hook"'));
    expect(hook).not.toContain('key="36"');
  });

  it("references audio files with the schema's required attributes", () => {
    const xml = buildDawprojectXml(makeProject());

    expect(xml).toContain(
      '<Audio id="audio_clip_vox_1" duration="3.750000" channels="2" sampleRate="44100" timeUnit="seconds">',
    );
    expect(xml).toContain('<File path="audio/clip_vox_1.wav"/>');
  });

  it("escapes XML-hostile names", () => {
    const xml = buildDawprojectXml(
      makeProject({
        tracks: [
          {
            id: "t",
            name: 'A <b> "c" & d',
            type: "midi",
            gain: 1,
            pan: 0,
            muted: false,
            soloed: false,
            notes: [],
            clips: [],
          },
        ],
        audio: [],
      }),
    );

    expect(xml).toContain(
      'name="A &lt;b&gt; &quot;c&quot; &amp; d"',
    );
  });

  it("builds a zip with project.xml and the referenced audio", async () => {
    const blob = buildDawproject(makeProject());
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(text).toContain("project.xml");
    expect(text).toContain("audio/clip_vox_1.wav");
  });

  it("sanitises ids so they stay valid xs:ID values", () => {
    expect(xmlId("track", "track 1/a")).toBe("track_track_1_a");
    expect(xmlId("track", "1abc")).toBe("track_x1abc");
  });
});
