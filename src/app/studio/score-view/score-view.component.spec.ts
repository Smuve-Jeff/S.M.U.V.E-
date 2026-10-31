import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MusicManagerService } from "../../services/music-manager.service";
import { ScoreViewComponent } from "./score-view.component";

describe("ScoreViewComponent", () => {
  let fixture: ComponentFixture<ScoreViewComponent>;
  let component: ScoreViewComponent;
  let tracks: ReturnType<typeof signal<any[]>>;
  let updateNote: jest.Mock;
  let removeNotes: jest.Mock;

  function createTracks() {
    return [
      {
        id: "piano-1",
        name: "Piano",
        type: "instrument",
        color: "#2ba09c",
        notes: [
          { id: "n-2", midi: 64, step: 16, length: 8, velocity: 0.5 },
          { id: "n-1", midi: 60, step: 0, length: 4, velocity: 0.9 },
        ],
      },
      {
        id: "audio-1",
        name: "Vocal audio",
        type: "audio",
        notes: [],
      },
    ];
  }

  beforeEach(() => {
    tracks = signal(createTracks());
    updateNote = jest.fn();
    removeNotes = jest.fn();
    TestBed.configureTestingModule({
      imports: [ScoreViewComponent],
      providers: [
        {
          provide: MusicManagerService,
          useValue: {
            tracks,
            updateNote,
            removeNotes,
            projectName: "Night Drive",
            engine: { tempo: () => 128 },
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ScoreViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("projects only MIDI tracks into sorted notation staves", () => {
    expect(component.staves()).toHaveLength(1);
    expect(component.staves()[0].name).toBe("Piano");
    expect(component.staves()[0].notes.map((note) => note.id)).toEqual([
      "n-1",
      "n-2",
    ]);
    expect(component.staves()[0].range).toBe("C4 – E4");
  });

  it("calculates bars from the furthest note while keeping a four-bar minimum", () => {
    expect(component.bars()).toBe(4);
    expect(component.totalNotes()).toBe(2);
    expect(component.barColumns()).toEqual([1, 2, 3, 4]);

    tracks.update((current) => [
      ...current,
      {
        id: "long-1",
        name: "Long phrase",
        type: "instrument",
        notes: [{ id: "n-long", midi: 72, step: 64, length: 1, velocity: 1 }],
      },
    ]);

    expect(component.bars()).toBe(5);
    expect(component.totalNotes()).toBe(3);
  });

  it("formats pitch, accidentals, duration, and velocity for score notes", () => {
    expect(component.noteName(61)).toBe("C♯");
    expect(component.octave(60)).toBe(4);
    expect(component.isAccidental(61)).toBe(true);
    expect(component.durationLabel(16)).toBe("whole");
    expect(component.durationLabel(2)).toBe("eighth");
    expect(component.durationLabel(1)).toBe("sixteenth");
  });

  it("adds velocity shading: louder notes are more opaque", () => {
    const notes = component.staves()[0].notes;
    const quiet = notes.find((n) => n.id === "n-2"); // velocity 0.5
    const loud = notes.find((n) => n.id === "n-1"); // velocity 0.9
    expect(quiet!.velocityOpacity).toBeCloseTo(0.725, 3);
    expect(loud!.velocityOpacity).toBeCloseTo(0.945, 3);
    expect(loud!.velocityOpacity).toBeGreaterThan(quiet!.velocityOpacity);
  });

  it("marks quarter-note rests on beats with no note onset", () => {
    const staff = component.staves()[0];
    // Two notes: n-1 at step 0 (bar 1, beat 1) and n-2 at step 16 (bar 2, beat 1).
    // Bars 1 and 2 each get rests on beats 2–4 → 3 + 3 = 6 rests.
    expect(staff.rests.length).toBe(6);
    expect(staff.rests.every((r) => r.bar === 1 || r.bar === 2)).toBe(true);
    expect(staff.rests.some((r) => r.left > 0)).toBe(true);
  });

  describe("notation editing", () => {
    const selectFirst = () => {
      component.selectNote("piano-1", "n-1");
    };

    it("exposes the selected note's pitch, position, length and velocity", () => {
      selectFirst();
      expect(component.selectedNote()?.note.id).toBe("n-1");
      expect(component.selectedPitch()).toBe("C4");
      expect(component.selectedPosition()).toBe("1.1");
      expect(component.selectedDuration()).toBe("quarter");
      expect(component.selectedVelocity()).toBe(114);
    });

    it("writes a transposition through the manager, not local state", () => {
      selectFirst();
      expect(component.transpose(1)).toBe(true);
      expect(updateNote).toHaveBeenCalledWith("piano-1", "n-1", { midi: 61 });

      selectFirst();
      expect(component.transpose(12)).toBe(true);
      expect(updateNote).toHaveBeenLastCalledWith("piano-1", "n-1", {
        midi: 72,
      });
    });

    it("clamps pitch at the ends of the MIDI range and skips no-ops", () => {
      tracks.update((current) => [
        { ...current[0], notes: [{ id: "top", midi: 127, step: 0, length: 1, velocity: 1 }] },
      ]);
      component.selectNote("piano-1", "top");
      expect(component.transpose(12)).toBe(false);
      expect(updateNote).not.toHaveBeenCalled();

      tracks.update((current) => [
        { ...current[0], notes: [{ id: "bottom", midi: 0, step: 0, length: 1, velocity: 1 }] },
      ]);
      component.selectNote("piano-1", "bottom");
      expect(component.transpose(-12)).toBe(false);
      expect(updateNote).not.toHaveBeenCalled();
    });

    it("never nudges a note before the first step", () => {
      selectFirst();
      expect(component.nudge(-1)).toBe(false);
      expect(updateNote).not.toHaveBeenCalled();

      expect(component.nudge(1)).toBe(true);
      expect(updateNote).toHaveBeenCalledWith("piano-1", "n-1", { step: 1 });
    });

    it("resizes and scales the written length within 1…32 steps", () => {
      selectFirst();
      expect(component.resize(1)).toBe(true);
      expect(updateNote).toHaveBeenLastCalledWith("piano-1", "n-1", {
        length: 5,
      });

      expect(component.scaleLength(2)).toBe(true);
      expect(updateNote).toHaveBeenLastCalledWith("piano-1", "n-1", {
        length: 8,
      });

      tracks.update((current) => [
        { ...current[0], notes: [{ id: "tiny", midi: 60, step: 0, length: 1, velocity: 1 }] },
      ]);
      component.selectNote("piano-1", "tiny");
      expect(component.scaleLength(0.5)).toBe(false);
      expect(updateNote).toHaveBeenCalledTimes(2);
    });

    it("keeps velocity inside 0.05…1 and stores it as a 0–1 float", () => {
      selectFirst();
      component.setVelocity(-8);
      expect(updateNote).toHaveBeenLastCalledWith(
        "piano-1",
        "n-1",
        expect.objectContaining({ velocity: expect.any(Number) }),
      );
      const written = updateNote.mock.calls.at(-1)![2].velocity;
      expect(written).toBeLessThan(0.9);
      expect(written).toBeGreaterThan(0.05);

      tracks.update((current) => [
        { ...current[0], notes: [{ id: "loud", midi: 60, step: 0, length: 1, velocity: 1 }] },
      ]);
      component.selectNote("piano-1", "loud");
      expect(component.setVelocity(8)).toBe(false);
      expect(updateNote).toHaveBeenCalledTimes(1);
    });

    it("deletes through the manager and clears the selection", () => {
      selectFirst();
      expect(component.deleteSelected()).toBe(true);
      expect(removeNotes).toHaveBeenCalledWith("piano-1", ["n-1"]);
      expect(component.selection()).toBeNull();
    });

    it("drops a stale selection when the note disappears (undo, Piano Roll edit)", () => {
      selectFirst();
      tracks.update((current) => [{ ...current[0], notes: [] }]);
      expect(component.selectedNote()).toBeNull();
      expect(component.deleteSelected()).toBe(false);
      expect(removeNotes).not.toHaveBeenCalled();
    });

    it("maps keyboard shortcuts onto the same edits", () => {
      selectFirst();
      const press = (key: string, init: KeyboardEventInit = {}) =>
        component.onScoreKeydown(
          new KeyboardEvent("keydown", { key, ...init }),
        );

      press("ArrowUp", { shiftKey: true });
      expect(updateNote).toHaveBeenLastCalledWith("piano-1", "n-1", {
        midi: 72,
      });

      press("ArrowLeft");
      expect(updateNote).toHaveBeenCalledTimes(1); // already at step 0

      press("]");
      expect(updateNote).toHaveBeenLastCalledWith("piano-1", "n-1", {
        length: 5,
      });

      press("Escape");
      expect(component.selection()).toBeNull();
    });

    it("ignores keys typed into a field and unmodified without a selection", () => {
      const input = document.createElement("input");
      selectFirst();
      component.onScoreKeydown(
        new KeyboardEvent("keydown", { key: "ArrowUp" }),
      );
      const eventWithInput = new KeyboardEvent("keydown", { key: "ArrowUp" });
      Object.defineProperty(eventWithInput, "target", { value: input });
      component.onScoreKeydown(eventWithInput);
      expect(updateNote).toHaveBeenCalledTimes(1);

      component.clearSelection();
      component.onScoreKeydown(
        new KeyboardEvent("keydown", { key: "ArrowUp" }),
      );
      expect(updateNote).toHaveBeenCalledTimes(1);
    });
  });

  describe("MusicXML export", () => {
    it("writes the MIDI tracks as parts, skipping audio and empty staves", () => {
      const xml = component.buildExportXml();
      expect(xml).toContain("<work-title>Night Drive</work-title>");
      expect(xml).toContain("<per-minute>128</per-minute>");
      expect(xml).toContain('<part-name>Piano</part-name>');
      // The vocal is an audio track: it has no notation to hand to a player.
      expect(xml).not.toContain("Vocal audio");
      expect(xml.match(/<part id=/g)).toHaveLength(1);
      expect(xml).toContain("<step>C</step>");
    });

    it("downloads a .musicxml file named after the project", () => {
      const createObjectURL = jest.fn(() => "blob:score");
      const revokeObjectURL = jest.fn();
      Object.defineProperty(URL, "createObjectURL", {
        value: createObjectURL,
        configurable: true,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        value: revokeObjectURL,
        configurable: true,
      });
      const click = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => undefined);

      jest.useFakeTimers();
      try {
        component.exportMusicXml();

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(click).toHaveBeenCalledTimes(1);
        // The blob is released only after the browser starts the download.
        expect(revokeObjectURL).not.toHaveBeenCalled();
        jest.runAllTimers();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:score");
      } finally {
        jest.useRealTimers();
        click.mockRestore();
      }
    });

    it("does not write an empty chart", () => {
      tracks.set([{ id: "audio-1", name: "Audio", type: "audio", notes: [] }]);
      expect(component.totalNotes()).toBe(0);

      const createObjectURL = jest.fn();
      Object.defineProperty(URL, "createObjectURL", {
        value: createObjectURL,
        configurable: true,
      });
      component.exportMusicXml();
      expect(createObjectURL).not.toHaveBeenCalled();
    });
  });
});
