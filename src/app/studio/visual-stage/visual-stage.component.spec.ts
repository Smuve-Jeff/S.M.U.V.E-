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

  it("emits dismiss only in the dismissible full-screen presentation", () => {
    const dismiss = jest.spyOn(component.dismiss, "emit");

    component.onEscape();
    expect(dismiss).not.toHaveBeenCalled();

    component.dismissible = true;
    component.onEscape();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
