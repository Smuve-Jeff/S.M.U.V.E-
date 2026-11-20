import { signal, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MusicManagerService } from "../../services/music-manager.service";
import {
  CharacterLibraryService,
  type SavedCharacterModel,
} from "./character-library.service";
import { VisualStageComponent } from "./visual-stage.component";

describe("VisualStageComponent", () => {
  let component: VisualStageComponent;
  let fixture: ComponentFixture<VisualStageComponent>;
  let library: {
    models: WritableSignal<SavedCharacterModel[]>;
    available: WritableSignal<boolean>;
    refresh: jest.Mock;
    save: jest.Mock;
    load: jest.Mock;
    remove: jest.Mock;
  };
  const engine = {
    tempo: signal(128),
    isPlaying: signal(false),
    masterAnalyser: null,
  };

  beforeEach(async () => {
    library = {
      models: signal<SavedCharacterModel[]>([]),
      available: signal(true),
      refresh: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(null),
      load: jest.fn().mockResolvedValue(null),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [VisualStageComponent],
      providers: [
        {
          provide: MusicManagerService,
          useValue: { engine },
        },
        {
          provide: CharacterLibraryService,
          useValue: library,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VisualStageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it("keeps the HUD usable and explains when WebGL is unavailable", async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(component.ready()).toBe(false);
    expect(component.fallbackReason()).toContain("WebGL");
    expect(fixture.nativeElement.querySelector("canvas")).toBeTruthy();
  });

  it("cycles the stage look and triggers a full-body move", () => {
    component.cycleMood();
    expect(component.mood()).toBe("hype");
    expect(component.lastGesture()).toBe("jump");

    component.cyclePalette();
    expect(component.palette()).toBe("violet");

    component.toggleParticles();
    expect(component.particlesOn()).toBe(false);

    component.triggerMove("spin");
    expect(component.lastGesture()).toBe("spin");
    expect(component.gestureLabel()).toBe("Spinning");
  });

  it("rejects non-GLB files with guidance before loading", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "performer.gltf", {
      type: "model/gltf+json",
    });

    await component.importCharacter(file);

    expect(component.importedCharacter()).toBe(false);
    expect(component.characterError()).toBe(true);
    expect(component.characterStatus()).toContain(".glb");
  });

  it("rejects an empty GLB and restores the built-in performer state", async () => {
    await component.importCharacter(
      new File([], "empty.glb", { type: "model/gltf-binary" }),
    );
    expect(component.characterError()).toBe(true);
    expect(component.characterStatus()).toContain("empty");

    component.restoreBuiltIn();
    expect(component.importedCharacter()).toBe(false);
    expect(component.characterLoading()).toBe(false);
    expect(component.characterName()).toBe("");
    expect(component.characterStatus()).toBe("BUILT-IN PERFORMER");
  });

  it("highlights a drag target and imports the dropped performer", () => {
    const importSpy = jest
      .spyOn(component, "importCharacter")
      .mockResolvedValue(undefined);
    const dragEvent = (file?: File) =>
      ({
        preventDefault: jest.fn(),
        dataTransfer: {
          types: ["Files"],
          files: file ? [file] : [],
          dropEffect: "none",
        },
      }) as unknown as DragEvent;

    component.onDragEnter(dragEvent());
    expect(component.dragActive()).toBe(true);

    component.onDragLeave(dragEvent());
    expect(component.dragActive()).toBe(false);

    const file = new File([new Uint8Array([1, 2, 3])], "Nova.glb", {
      type: "model/gltf-binary",
    });
    const drop = dragEvent(file);
    component.onDragEnter(drop);
    component.onDrop(drop);

    expect(drop.preventDefault).toHaveBeenCalled();
    expect(component.dragActive()).toBe(false);
    expect(importSpy).toHaveBeenCalledWith(file);
  });

  it("loads a saved performer from the library onto the stage", async () => {
    const model: SavedCharacterModel = {
      id: "abc",
      name: "Nova",
      fileName: "Nova.glb",
      size: 2048,
      clips: 3,
      addedAt: 1,
    };
    const file = new File([new Uint8Array([1, 2, 3])], "Nova.glb", {
      type: "model/gltf-binary",
    });
    library.models.set([model]);
    library.load.mockResolvedValue(file);
    const importSpy = jest
      .spyOn(component, "importCharacter")
      .mockResolvedValue(undefined);

    component.toggleLibrary();
    expect(component.libraryOpen()).toBe(true);
    expect(component.savedCount()).toBe(1);

    await component.useSavedCharacter(model);

    expect(library.load).toHaveBeenCalledWith("abc");
    expect(importSpy).toHaveBeenCalledWith(file);
    expect(component.libraryOpen()).toBe(false);
  });

  it("removes one saved performer and reports it", async () => {
    await component.removeSavedCharacter({
      id: "abc",
      name: "Nova",
      fileName: "Nova.glb",
      size: 2048,
      clips: 0,
      addedAt: 1,
    });

    expect(library.remove).toHaveBeenCalledWith("abc");
    expect(component.characterStatus()).toContain("Nova");
  });

  it("formats saved model sizes for the library list", () => {
    expect(component.formatSize(512)).toBe("1 KB");
    expect(component.formatSize(2048)).toBe("2 KB");
    expect(component.formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("emits dismiss only in the dismissible full-screen presentation", () => {
    const dismiss = jest.spyOn(component.dismiss, "emit");

    component.onEscape();
    expect(dismiss).not.toHaveBeenCalled();

    component.dismissible = true;
    component.onEscape();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
