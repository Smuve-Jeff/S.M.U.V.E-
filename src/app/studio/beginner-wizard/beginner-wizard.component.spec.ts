import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BeginnerWizardComponent } from "./beginner-wizard.component";
import { HapticService } from "../../services/haptic.service";

describe("BeginnerWizardComponent", () => {
  let fixture: ComponentFixture<BeginnerWizardComponent>;
  let component: BeginnerWizardComponent;
  let haptic: { light: jest.Mock; medium: jest.Mock };

  const createWizard = () => {
    fixture = TestBed.createComponent(BeginnerWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    localStorage.clear();
    haptic = { light: jest.fn(), medium: jest.fn() };
    TestBed.configureTestingModule({
      imports: [BeginnerWizardComponent],
      providers: [{ provide: HapticService, useValue: haptic }],
    });
    createWizard();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  describe("the guided path", () => {
    it("shows the whole song process but only one step at a time", () => {
      expect(
        fixture.nativeElement.querySelectorAll(".wizard-path-step").length,
      ).toBe(6);
      expect(fixture.nativeElement.querySelectorAll(".wizard-card").length).toBe(
        1,
      );
      expect(component.currentStep().title).toBe("Pick a Beat");
    });

    it("teaches the steps in the order a song is actually made", () => {
      expect(component.steps.map((step) => step.short)).toEqual([
        "Beat",
        "Melody",
        "Voice",
        "Order",
        "Mix",
        "Share",
      ]);
      // Every step names one action and shows what its result sounds like.
      component.steps.forEach((step) => {
        expect(step.description.length).toBeGreaterThan(20);
        expect(step.example.length).toBeGreaterThan(10);
        expect(step.action.startsWith("Open")).toBe(true);
      });
    });

    it("starts from a blank canvas or a complete groove without ticking steps", () => {
      const launches: { view: string; preset: string }[] = [];
      component.launchWithPreset.subscribe((payload) => launches.push(payload));

      (
        fixture.nativeElement.querySelector(
          '[data-starter="blank"]',
        ) as HTMLButtonElement
      ).click();
      (
        fixture.nativeElement.querySelector(
          '[data-starter="house"]',
        ) as HTMLButtonElement
      ).click();

      expect(launches).toEqual([
        { view: "drum-machine", preset: "blank" },
        { view: "drum-machine", preset: "house" },
      ]);
      expect(component.completedCount()).toBe(0);
      expect(haptic.medium).toHaveBeenCalled();
    });

    it("opens the real tool for the step on screen", () => {
      const views: string[] = [];
      component.navigateToView.subscribe((view) => views.push(view));

      component.openStep();

      expect(views).toEqual(["drum-machine"]);
      expect(haptic.light).toHaveBeenCalled();
    });

    it("ticks a step only when the artist says it is done, then moves on", () => {
      expect(component.isStepDone(1)).toBe(false);

      component.completeAndAdvance();

      expect(component.isStepDone(1)).toBe(true);
      expect(component.currentStep().title).toBe("Add a Melody");
      expect(JSON.parse(localStorage.getItem("smuve_wizard_done")!)).toEqual([1]);
      expect(haptic.medium).toHaveBeenCalled();
    });

    it("jumps ahead from the path without marking skipped steps done", () => {
      component.goToStep(5);

      expect(component.currentStep().title).toBe("Make It Sound Good");
      expect(component.completedCount()).toBe(0);
      expect(fixture.nativeElement.querySelector(".wizard-finish")).toBeFalsy();
    });

    it("celebrates only after all six steps are done", () => {
      for (let i = 0; i < component.steps.length; i += 1) {
        component.completeAndAdvance();
      }

      expect(component.allDone()).toBe(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(".wizard-finish")).toBeTruthy();
    });

    it("resumes at the first unfinished step on a fresh session", () => {
      localStorage.setItem("smuve_wizard_done", JSON.stringify([1, 2]));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [BeginnerWizardComponent],
        providers: [{ provide: HapticService, useValue: haptic }],
      });

      const resumed = TestBed.createComponent(BeginnerWizardComponent);

      expect(resumed.componentInstance.currentStep().title).toBe(
        "Sing or Rap on It",
      );
    });

    it("returns to the selected step after the wizard is remounted", () => {
      component.goToStep(5);
      fixture.destroy();

      const returned = TestBed.createComponent(BeginnerWizardComponent);
      returned.detectChanges();

      expect(returned.componentInstance.currentStep().id).toBe(5);
      expect(returned.componentInstance.completedCount()).toBe(0);
    });

    it("starts over from step one and clears the ticks", () => {
      component.completeAndAdvance();
      component.goToStep(4);

      component.resetWizard();

      expect(component.stepIndex()).toBe(0);
      expect(component.completedCount()).toBe(0);
      expect(localStorage.getItem("smuve_wizard_done")).toBe("[]");
    });
  });

  describe("progress persistence", () => {
    it("shows a notice when the device refuses to store progress", () => {
      const setItem = jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("QuotaExceededError");
        });

      (component as any).persistDoneSteps(new Set([1]));

      expect(component.progressError()).toContain("could not be saved");
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector(".wizard-progress-error")
          ?.textContent,
      ).toContain("could not be saved");
      setItem.mockRestore();
    });

    it("clears the notice once progress is stored", () => {
      const setItem = jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("QuotaExceededError");
        });
      (component as any).persistDoneSteps(new Set([1]));
      setItem.mockRestore();

      (component as any).persistDoneSteps(new Set([1, 2]));

      expect(component.progressError()).toBeNull();
      expect(localStorage.getItem("smuve_wizard_done")).toContain("2");
    });
  });
});
