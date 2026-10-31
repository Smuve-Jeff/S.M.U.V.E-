import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BeginnerWizardComponent } from "./beginner-wizard.component";
import { HapticService } from "../../services/haptic.service";

describe("BeginnerWizardComponent progress persistence", () => {
  let fixture: ComponentFixture<BeginnerWizardComponent>;
  let component: BeginnerWizardComponent;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [BeginnerWizardComponent],
      providers: [
        {
          provide: HapticService,
          useValue: { light: jest.fn(), medium: jest.fn() },
        },
      ],
    });
    fixture = TestBed.createComponent(BeginnerWizardComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

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
      fixture.nativeElement.querySelector(".wizard-progress-error")?.textContent,
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
