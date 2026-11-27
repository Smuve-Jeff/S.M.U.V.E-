import { StudioMeterComponent } from "./studio-meter.component";

describe("StudioMeterComponent", () => {
  let component: StudioMeterComponent;

  beforeEach(() => {
    component = new StudioMeterComponent();
  });

  it("clamps invalid and out-of-range levels", () => {
    expect(component.normalized(-1)).toBe(0);
    expect(component.normalized(Number.NaN)).toBe(0);
    expect(component.normalized(0.42)).toBe(0.42);
    expect(component.normalized(1.8)).toBe(1);
  });

  it("renders percent and dB readouts from the normalized value", () => {
    component.level = 0.5;
    component.unit = "%";
    expect(component.displayValue()).toBe("50%");

    component.unit = "dB";
    expect(component.displayValue()).toBe("-6 dB");

    component.level = 0;
    expect(component.displayValue()).toBe("-60 dB");
  });
});
