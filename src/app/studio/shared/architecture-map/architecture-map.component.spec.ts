import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ArchitectureMapComponent } from "./architecture-map.component";

/**
 * The Music Map is pure explanation. Its contract is:
 *  • never navigates on its own — it only asks the shell,
 *  • closes from every affordance (✕, backdrop, Escape) via one `close` output.
 */
describe("ArchitectureMapComponent", () => {
  let fixture: ComponentFixture<ArchitectureMapComponent>;
  let component: ArchitectureMapComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArchitectureMapComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ArchitectureMapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("renders the sheet with the four layers and the one-document rule", () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("Surfaces");
    expect(text).toContain("THE SONG DOCUMENT");
    expect(text).toContain("Engine");
    expect(text).toContain("Support");
    expect(text).toContain("MusicManagerService");
  });

  it("never navigates itself: the CTA only emits onQuickSession", () => {
    const onQuickSession = jest.spyOn(component.onQuickSession, "emit");
    const close = jest.spyOn(component.close, "emit");

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>(".arch-map-cta")
      ?.click();

    expect(onQuickSession).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    // The shell owns view state: it must wire the output through
    // setActiveView("quick-session") and hide the sheet itself (template).
  });

  it("closes from the ✕ button (backdrop click and Escape share the output)", () => {
    const close = jest.spyOn(component.close, "emit");

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>(".arch-map-close")
      ?.click();
    expect(close).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledTimes(2);
  });
});
