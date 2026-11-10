import { ComponentFixture, TestBed } from "@angular/core/testing";

import { HapticService } from "../../services/haptic.service";
import { StudioGuideCompletionComponent } from "./studio-guide-completion.component";
import type { GuideLessonCompletion } from "./studio-guide.auto-check.service";

const completion: GuideLessonCompletion = {
  lessonId: "loop-sound",
  title: "Hear your first sound",
  trackId: "first-loop",
  trackLabel: "First Loop",
  nextLessonId: "loop-groove",
  nextLessonTitle: "Borrow a groove, then make it yours",
  completedAt: 1_700_000_000_000,
};

describe("StudioGuideCompletionComponent", () => {
  let fixture: ComponentFixture<StudioGuideCompletionComponent>;
  let component: StudioGuideCompletionComponent;
  const haptic = { success: jest.fn() };

  beforeEach(async () => {
    haptic.success.mockClear();
    await TestBed.configureTestingModule({
      imports: [StudioGuideCompletionComponent],
      providers: [{ provide: HapticService, useValue: haptic }],
    }).compileComponents();

    fixture = TestBed.createComponent(StudioGuideCompletionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("completion", completion);
    fixture.detectChanges();
  });

  it("celebrates the lesson and names the next one", () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";

    expect(text).toContain("Lesson complete");
    expect(text).toContain("Hear your first sound");
    expect(text).toContain("Borrow a groove, then make it yours");
    expect(text).toContain("Next lesson");
    expect(haptic.success).toHaveBeenCalledTimes(1);
  });

  it("hands the next lesson to the shell instead of navigating itself", () => {
    const openNext = jest.spyOn(component.openNext, "emit");
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      ".gc-btn-primary",
    ) as HTMLButtonElement;

    button.click();

    expect(openNext).toHaveBeenCalledWith(completion);
  });

  it("can be dismissed without leaving the studio", () => {
    const dismiss = jest.spyOn(component.dismiss, "emit");
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      ".gc-btn-ghost",
    ) as HTMLButtonElement;

    button.click();

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
