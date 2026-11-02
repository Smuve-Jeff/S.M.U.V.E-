import { TestBed } from "@angular/core/testing";
import { BeginnerStepHintComponent } from "./beginner-step-hint.component";
import { BeginnerPathService } from "./beginner-path.service";

describe("BeginnerStepHintComponent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("names the current step and the one action it asks for", () => {
    localStorage.setItem("smuve_wizard_done", JSON.stringify([1, 2]));

    const fixture = TestBed.createComponent(BeginnerStepHintComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Step 3 of 6");
    expect(text).toContain("Sing or Rap on It");
    expect(text).toContain("Open the Recorder");
  });

  it("follows a step selected in the wizard", () => {
    const fixture = TestBed.createComponent(BeginnerStepHintComponent);
    fixture.detectChanges();

    TestBed.inject(BeginnerPathService).select(5);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Make It Sound Good");
  });

  it("knows when every step is done", () => {
    localStorage.setItem("smuve_wizard_done", JSON.stringify([1, 2, 3, 4, 5, 6]));

    const fixture = TestBed.createComponent(BeginnerStepHintComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Step 6 of 6");
    expect(fixture.nativeElement.textContent).toContain("Save and Share");
  });
});
