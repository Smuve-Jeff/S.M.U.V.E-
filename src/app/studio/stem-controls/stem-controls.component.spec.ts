import { ComponentFixture, TestBed } from "@angular/core/testing";

import { StemControlsComponent } from "./stem-controls.component";

describe("StemControlsComponent", () => {
  let fixture: ComponentFixture<StemControlsComponent>;
  let component: StemControlsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StemControlsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StemControlsComponent);
    component = fixture.componentInstance;
    component.deckId = "A";
    fixture.detectChanges();
  });

  it("emits the stem and gain a slider moved to", () => {
    const emitted: Array<{ stem: string; gain: number }> = [];
    component.gainChange.subscribe((event) => emitted.push(event));

    const input = document.createElement("input");
    input.value = "0.35";

    component.onGainChange("vocals", {
      target: input,
    } as unknown as Event);

    expect(emitted).toEqual([{ stem: "vocals", gain: 0.35 }]);
    expect(component.gainValues["vocals"]).toBe(0.35);
  });

  it("keeps each stem's trim independent", () => {
    const input = (value: string) => {
      const el = document.createElement("input");
      el.value = value;
      return { target: el } as unknown as Event;
    };

    component.onGainChange("vocals", input("0.2"));
    component.onGainChange("drums", input("0.9"));

    expect(component.gainValues).toMatchObject({
      vocals: 0.2,
      drums: 0.9,
      bass: 1,
      melody: 1,
    });
  });
});
