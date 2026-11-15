import { trimClipContent } from "./clip-trim.util";

describe("trimClipContent", () => {
  // 120 BPM in 4/4: one bar is 2 s.
  const secondsPerBar = 2;

  it("leaves MIDI clips as pure geometry", () => {
    expect(
      trimClipContent(
        { type: "midi", start: 1, length: 4, secondsPerBar },
        "start",
        0.25,
      ),
    ).toEqual({ start: 1.25, length: 3.75 });
  });

  it("moves an audio clip's read position with its left edge", () => {
    // Trimming half a bar off the left edge consumes one second of audio, so
    // the surviving content still starts where it was sung.
    expect(
      trimClipContent(
        { type: "audio", start: 4, length: 4, offset: 3, secondsPerBar },
        "start",
        0.5,
      ),
    ).toEqual({ start: 4.5, length: 3.5, offset: 4 });
  });

  it("refuses to extend an audio clip before the start of its buffer", () => {
    // Only 1 s of audio exists before the current read position, so the edge can
    // move back half a bar at most.
    expect(
      trimClipContent(
        { type: "audio", start: 4, length: 4, offset: 1, secondsPerBar },
        "start",
        -2,
      ),
    ).toEqual({ start: 3.5, length: 4.5, offset: 0 });
  });

  it("never moves an audio clip before bar 1", () => {
    const patch = trimClipContent(
      { type: "audio", start: 0.25, length: 4, offset: 5, secondsPerBar },
      "start",
      -1,
    );
    expect(patch?.start).toBe(0);
  });

  it("does not stretch the right edge past the end of the audio", () => {
    // 2 s read position in a 6 s buffer leaves 2 bars of audio, however far the
    // edge is dragged.
    expect(
      trimClipContent(
        {
          type: "audio",
          start: 0,
          length: 1,
          offset: 2,
          audioDurationSeconds: 6,
          secondsPerBar,
        },
        "end",
        5,
      ),
    ).toEqual({ start: 0, length: 2 });
  });

  it("shortens the right edge without touching the read position", () => {
    expect(
      trimClipContent(
        { type: "audio", start: 0, length: 4, offset: 2, secondsPerBar },
        "end",
        -0.5,
      ),
    ).toEqual({ start: 0, length: 3.5 });
  });

  it("keeps a quarter bar as the floor", () => {
    expect(
      trimClipContent(
        { type: "audio", start: 0, length: 0.5, offset: 1, secondsPerBar },
        "end",
        -10,
      ),
    ).toEqual({ start: 0, length: 0.25 });
  });

  it("trims a streamed clip's origin instead of a decoded offset", () => {
    expect(
      trimClipContent(
        {
          type: "audio",
          start: 0,
          length: 4,
          streamed: true,
          clipOriginSeconds: 8,
          secondsPerBar,
        },
        "start",
        0.25,
      ),
    ).toEqual({ start: 0.25, length: 3.75, clipOriginSeconds: 8.5 });
  });

  it("reports no patch when the gesture changes nothing", () => {
    expect(
      trimClipContent(
        { type: "audio", start: 0, length: 4, offset: 0, secondsPerBar },
        "end",
        0,
      ),
    ).toBeNull();
    expect(
      trimClipContent(
        { type: "midi", start: 0, length: 4, secondsPerBar },
        "end",
        0,
      ),
    ).toBeNull();
  });
});
