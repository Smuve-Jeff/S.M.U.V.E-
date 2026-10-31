import { TestBed } from "@angular/core/testing";
import { ChordEditorComponent } from "./chord-editor.component";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";
import { MusicManagerService } from "../../services/music-manager.service";

describe("ChordEditorComponent", () => {
  let component: ChordEditorComponent;
  let fixture: any;
  let haptic: { light: jest.Mock; medium: jest.Mock };

  const chord = (label: string, rootMidi: number) => ({
    label,
    rootMidi,
    intervals: [0, 4, 7],
    quality: "Maj",
  });

  beforeEach(async () => {
    haptic = { light: jest.fn(), medium: jest.fn() };
    await TestBed.configureTestingModule({
      imports: [ChordEditorComponent],
      providers: [
        { provide: HapticService, useValue: haptic },
        {
          provide: SnackbarService,
          useValue: { info: jest.fn(), success: jest.fn(), show: jest.fn() },
        },
        {
          provide: MusicManagerService,
          useValue: { selectedTrackId: () => null, addNoteToTrack: jest.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChordEditorComponent);
    component = fixture.componentInstance;
    component.progression.set([
      chord("C", 60),
      chord("Am", 57),
      chord("F", 53),
    ]);
    fixture.detectChanges();
  });

  afterEach(() => {
    component.endDrag();
    document
      .querySelectorAll<HTMLElement>(".ce-chord-card")
      .forEach((card) => {
        if (card.style.position === "fixed") card.remove();
      });
  });

  const labels = () => component.progression().map((item) => item.label);

  it("moves a chord down one position from the keyboard", () => {
    const preventDefault = jest.fn();
    component.moveChord(0, 1, { preventDefault } as any);
    expect(preventDefault).toHaveBeenCalled();
    expect(labels()).toEqual(["Am", "C", "F"]);
    expect(haptic.light).toHaveBeenCalled();
  });

  it("ignores keyboard moves past either end of the progression", () => {
    component.moveChord(0, -1);
    component.moveChord(2, 1);
    expect(labels()).toEqual(["C", "Am", "F"]);
  });

  it("starts a pointer drag, shows a fixed ghost and clears it on release", () => {
    const card = fixture.nativeElement.querySelector(
      ".ce-chord-card",
    ) as HTMLElement;
    card.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientY: 40,
        clientX: 20,
      }),
    );

    expect(component.draggingIndex()).toBe(0);
    const ghost = document.body.lastElementChild as HTMLElement;
    expect(ghost).not.toBe(card);
    expect(ghost.style.position).toBe("fixed");
    expect(ghost.style.pointerEvents).toBe("none");

    component.endDrag();
    expect(component.draggingIndex()).toBeNull();
    expect(document.body.contains(ghost)).toBe(false);
  });

  it("does not start a drag from the remove or stamp buttons", () => {
    const button = fixture.nativeElement.querySelector(
      ".ce-icon-btn-sm",
    ) as HTMLElement;
    button.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    expect(component.draggingIndex()).toBeNull();
  });

  it("only starts a drag with the primary pointer button", () => {
    const card = fixture.nativeElement.querySelector(
      ".ce-chord-card",
    ) as HTMLElement;
    card.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 2 }),
    );
    expect(component.draggingIndex()).toBeNull();
  });
});
