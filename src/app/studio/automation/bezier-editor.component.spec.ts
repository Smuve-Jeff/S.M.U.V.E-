import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { AutomationService } from "../automation.service";
import { BezierEditorComponent } from "./bezier-editor.component";

describe("BezierEditorComponent", () => {
  const lanes = signal([
    {
      id: "lane-1",
      points: [
        { time: 0, value: 0 },
        { time: 1, value: 100 },
      ],
      target: { min: 0, max: 127 },
    },
  ]);
  const updatePoint = jest.fn();
  const setLaneInterpolation = jest.fn();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BezierEditorComponent],
      providers: [
        {
          provide: AutomationService,
          useValue: { lanes, updatePoint, setLaneInterpolation },
        },
      ],
    });
  });

  it("applies presets, clamps typed handles, and commits the curve", () => {
    const fixture = TestBed.createComponent(BezierEditorComponent);
    const component = fixture.componentInstance;
    component.laneId = "lane-1";
    const emitted = jest.fn();
    component.curveChanged.subscribe(emitted);

    component.applyPreset("easeIn");
    expect(component.activePreset()).toBe("easeIn");

    component.setHandle("in", "t", 1.8);
    expect(component.cpIn().t).toBe(1);
    expect(component.activePreset()).toBe("");

    component.commitCurve();
    expect(emitted).toHaveBeenCalledWith({
      cpIn: component.cpIn(),
      cpOut: component.cpOut(),
    });
    expect(updatePoint).toHaveBeenCalledWith(
      "lane-1",
      0,
      expect.objectContaining({ bezierHandles: expect.any(Object) }),
    );
    expect(setLaneInterpolation).toHaveBeenCalledWith("lane-1", "bezier");
  });
});
