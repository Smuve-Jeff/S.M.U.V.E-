import { ComponentFixture, TestBed } from "@angular/core/testing";
import { SnackbarComponent } from "./snackbar.component";

describe("SnackbarComponent", () => {
  let fixture: ComponentFixture<SnackbarComponent>;
  let canvas: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SnackbarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SnackbarComponent);
    fixture.detectChanges();
    canvas = document.createElement("section");
    canvas.className = "comp-canvas studio-primary-canvas";
    document.body.appendChild(canvas);
  });

  afterEach(() => {
    fixture.destroy();
    canvas.remove();
  });

  it("makes the host visible when a toast is shown", () => {
    fixture.componentInstance.show({ message: "Saved", duration: 60_000 });
    fixture.detectChanges();

    expect(fixture.nativeElement.classList).toContain("visible");
    expect(fixture.nativeElement.querySelector(".snackbar-message").textContent).toContain("Saved");
  });

  it("positions the toast below the Studio canvas and follows viewport changes", () => {
    jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      top: 120,
    } as DOMRect);

    fixture.componentInstance.show({ message: "Saved", duration: 60_000 });
    expect(fixture.nativeElement.style.top).toBe("128px");

    canvas.getBoundingClientRect = jest.fn().mockReturnValue({
      top: 200,
    } as DOMRect);
    window.dispatchEvent(new Event("resize"));
    expect(fixture.nativeElement.style.top).toBe("208px");
  });

  it("falls back to the default top offset when no Studio canvas exists", () => {
    canvas.remove();
    fixture.componentInstance.show({ message: "Saved", duration: 60_000 });

    expect(fixture.nativeElement.style.top).toBe("80px");
  });
});
