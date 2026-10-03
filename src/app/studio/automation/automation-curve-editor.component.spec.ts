import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AutomationCurveEditorComponent } from './automation-curve-editor.component';
import { AutomationService } from '../automation.service';
import { AudioEngineService } from '../../services/audio-engine.service';

describe('AutomationCurveEditorComponent', () => {
  let fixture: ComponentFixture<AutomationCurveEditorComponent>;
  let component: AutomationCurveEditorComponent;
  let automation: AutomationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutomationCurveEditorComponent],
      providers: [
        AutomationService,
        {
          provide: AudioEngineService,
          useValue: { applyProductionParameter: jest.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AutomationCurveEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('barWidth', 100);
    fixture.componentRef.setInput('totalBars', 4);
    automation = TestBed.inject(AutomationService);
  });

  it('filters lanes to the given track', () => {
    automation.addLane('t1', 'volume');
    automation.addLane('t2', 'pan');
    fixture.componentRef.setInput('trackId', 't1');
    expect(component.lanes().map((l) => l.target.trackId)).toEqual(['t1']);

    fixture.componentRef.setInput('trackId', null);
    expect(component.lanes().length).toBe(2);
  });

  it('adds a lane for the selected parameter and marks it selected', () => {
    fixture.componentRef.setInput('trackId', 't1');
    component.addParameter.set('cutoff');
    component.addLane();

    const lane = component.lanes()[0];
    expect(lane.target.parameter).toBe('cutoff');
    expect(lane.interpolation).toBe('smooth');
    expect(component.selectedLaneId()).toBe(lane.id);

    // Without a track selection there is nothing to attach a lane to.
    fixture.componentRef.setInput('trackId', null);
    component.addLane();
    expect(automation.lanes().length).toBe(1);
  });

  it('converts lane-local pixels into time/value keyframes', () => {
    const lane = automation.ensureLane('t1', 'volume', { min: 0, max: 1 });
    component.addPointAt(lane, 50, component.laneHeight / 2);

    const point = automation.lanes()[0].points[0];
    // barWidth 100px = 1 bar = 16 steps → x=50px is step 8.
    expect(point.time).toBeCloseTo(8, 3);
    // y at mid-height is value 0.5 on a 0–1 range.
    expect(point.value).toBeCloseTo(0.5, 2);
  });

  it('clamps keyframes to the lane range and song length', () => {
    const lane = automation.ensureLane('t1', 'volume', { min: 0, max: 1 });
    component.addPointAt(lane, -40, -100); // before start / above range
    const point = automation.lanes()[0].points[0];
    expect(point.time).toBe(0);
    expect(point.value).toBe(1);
  });

  it('moves a keyframe, re-sorts the lane, and returns the new index', () => {
    const lane = automation.ensureLane('t1', 'volume', { min: 0, max: 1 });
    automation.addPoint(lane.id, 0, 0.2);
    automation.addPoint(lane.id, 8, 0.8);

    const newIndex = component.movePointTo(lane.id, 0, 12, 0.6);
    expect(newIndex).toBe(1);
    expect(automation.lanes()[0].points.map((p) => p.time)).toEqual([8, 12]);
    expect(automation.lanes()[0].points[1].value).toBeCloseTo(0.6, 3);
  });

  it('deletes keyframes and clears/removes lanes', () => {
    const lane = automation.ensureLane('t1', 'volume');
    automation.addPoint(lane.id, 0, 0.2);
    automation.addPoint(lane.id, 4, 0.4);

    component.deletePoint(lane.id, 0);
    expect(automation.lanes()[0].points.map((p) => p.time)).toEqual([4]);

    component.clearLane(automation.lanes()[0]);
    expect(automation.lanes()[0].points).toEqual([]);

    component.removeLane(automation.lanes()[0]);
    expect(automation.lanes()).toEqual([]);
  });

  it('renders a sampled curve path and positioned points', () => {
    const lane = automation.ensureLane('t1', 'volume', { min: 0, max: 1 });
    automation.addPoint(lane.id, 0, 0.25);
    automation.addPoint(lane.id, 16, 0.75);

    const view = component.laneViews()[0];
    expect(view.path.startsWith('M')).toBe(true);
    expect(view.path).toContain('L');
    expect(view.points).toHaveLength(2);
    expect(view.points[0].x).toBeCloseTo(0, 3);
    expect(view.points[1].x).toBeCloseTo(100, 3); // step 16 = 1 bar
    expect(view.points[0].y).toBeGreaterThan(view.points[1].y); // higher value rises
  });

  it('round-trips geometry helpers for log-scaled filters', () => {
    expect(component.xToTime(component.timeToX(12))).toBeCloseTo(12, 6);
    const range = { min: 20, max: 20_000, logarithmic: true };
    for (const value of [20, 200, 2000, 20_000]) {
      expect(component.yToValue(component.valueToY(value, range), range)).toBeCloseTo(
        value,
        3,
      );
    }
  });

  it('emits the lane id for the full bezier editor', () => {
    const lane = automation.ensureLane('t1', 'volume');
    automation.addPoint(lane.id, 0, 0.5);
    fixture.detectChanges();

    const emitted: string[] = [];
    component.openBezierEditor.subscribe((id) => emitted.push(id));
    const curveButton = fixture.nativeElement.querySelector(
      '.automation-lane-action',
    ) as HTMLButtonElement;
    curveButton.click();
    expect(emitted).toEqual([lane.id]);
  });

  it('toggles lane enablement and interpolation', () => {
    const lane = automation.ensureLane('t1', 'volume');
    component.toggleLane(lane);
    expect(automation.lanes()[0].enabled).toBe(false);

    component.setInterpolation(
      automation.lanes()[0],
      { target: { value: 'bezier' } } as unknown as Event,
    );
    expect(automation.lanes()[0].interpolation).toBe('bezier');
  });
});
