import {
  dropBarFromWorldX,
  droppedAudioName,
  isSupportedAudioFile,
} from "./audio-drop.util";

describe("arrangement audio drop helpers", () => {
  it("accepts audio by MIME type or extension", () => {
    expect(isSupportedAudioFile({ name: "take.wav", type: "audio/wav" })).toBe(
      true,
    );
    // Android and several desktop browsers report an empty type for these.
    expect(isSupportedAudioFile({ name: "stem.FLAC", type: "" })).toBe(true);
    expect(isSupportedAudioFile({ name: "vocal.aiff", type: "" })).toBe(true);
    expect(isSupportedAudioFile({ name: "notes.mid", type: "" })).toBe(false);
    expect(isSupportedAudioFile({ name: "photo.png", type: "image/png" })).toBe(
      false,
    );
    expect(isSupportedAudioFile({ name: "" })).toBe(false);
  });

  it("maps the drop point to a bar and never goes negative", () => {
    expect(dropBarFromWorldX(0, 200)).toBe(0);
    expect(dropBarFromWorldX(400, 200)).toBe(2);
    expect(dropBarFromWorldX(399, 200)).toBe(2);
    expect(dropBarFromWorldX(-500, 200)).toBe(0);
    // A degenerate width must not divide by zero.
    expect(dropBarFromWorldX(100, 0)).toBe(100);
  });

  it("names the new track from the file, without the extension", () => {
    expect(droppedAudioName("Take 3 (bounced).wav")).toBe("Take 3 (bounced)");
    expect(droppedAudioName("vocal.flac")).toBe("vocal");
    expect(droppedAudioName("")).toBe("Imported audio");
  });
});
