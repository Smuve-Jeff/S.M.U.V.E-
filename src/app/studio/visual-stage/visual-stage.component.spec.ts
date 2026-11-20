import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MusicManagerService } from "../../services/music-manager.service";
import { VisualStageComponent } from "./visual-stage.component";

describe("VisualStageComponent", () => {
  let component: VisualStageComponent;
  let fixture: ComponentFixture<VisualStageComponent>;
  const engine = {
    tempo: signal(128),
    isPlaying: signal(false),
    masterAnalyser: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisualStageComponent],
      providers: [
        {
          provide: MusicManagerService,
          useValue: { engine },
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

  it("emits dismiss only in the dismissible full-screen presentation", () => {
    const dismiss = jest.spyOn(component.dismiss, "emit");

    component.onEscape();
    expect(dismiss).not.toHaveBeenCalled();

    component.dismissible = true;
    component.onEscape();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
