import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { TimingDiagnosticsComponent } from "./timing-diagnostics.component";
import { AudioEngineService } from "../../services/audio-engine.service";
import { MusicManagerService } from "../../services/music-manager.service";
import type { ScheduledNoteTiming } from "../../services/music-manager.service";

describe("TimingDiagnosticsComponent", () => {
  let fixture: ComponentFixture<TimingDiagnosticsComponent>;
  let component: TimingDiagnosticsComponent;

  const visualStep = signal(5);
  const tempo = signal(120);
  const lastScheduledNote = signal<ScheduledNoteTiming | null>(null);
  const tempoMap = [
    { step: 0, bpm: 100, curve: "ramp" as const },
    { step: 16, bpm: 140 },
  ];

  const engine = {
    visualStep,
    tempo,
    tempoAtStep: (step: number) => {
      const marker = tempoMap[0];
      const next = tempoMap[1];
      const progress = Math.max(
        0,
        Math.min(1, (step - marker.step) / (next.step - marker.step)),
      );
      return marker.bpm + (next.bpm - marker.bpm) * progress;
    },
    secondsBetweenSteps: (from: number, to: number) => (to - from) * 0.1,
    stepsPerBeat: () => 4,
    getTempoMap: () => tempoMap,
    getContext: () => ({ currentTime: 1 }),
  };

  beforeEach(async () => {
    visualStep.set(5);
    tempo.set(120);
    lastScheduledNote.set(null);

    await TestBed.configureTestingModule({
      imports: [TimingDiagnosticsComponent],
      providers: [
        { provide: AudioEngineService, useValue: engine },
        { provide: MusicManagerService, useValue: { lastScheduledNote } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TimingDiagnosticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("shows the tick clock and the live tempo ramp", () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("960 PPQ");
    expect(text).toContain("240 ticks / 16th");
    // Step 5 of a 100→140 ramp over 16 steps: 112.5 now, 115 at the boundary.
    expect(text).toContain("112.5 → 115 BPM");
    expect(text).toContain("RAMP");
    expect(
      fixture.nativeElement.querySelector('[data-testid="td-tick"]')
        .textContent,
    ).toContain("1200");
    expect(
      fixture.nativeElement.querySelector('[data-testid="td-step"]')
        .textContent,
    ).toContain("#5");
  });

  it("renders the last scheduled note in ticks and milliseconds", () => {
    lastScheduledNote.set({
      trackId: "track-1",
      trackName: "Lead",
      step: 5,
      offsetTicks: 80,
      absoluteTick: 1280,
      durationTicks: 80,
      bpm: 120,
      scheduledTime: 1.25,
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Lead");
    expect(text).toContain("step 5 · tick 1280");
    expect(text).toContain("+80 t");
    expect(text).toContain("80 t · 41.67 ms");
    expect(text).toContain("250 ms");
  });

  it("shows an empty state before the first note", () => {
    expect(fixture.nativeElement.textContent).toContain(
      "No note scheduled yet",
    );
  });

  it("asks the transport to close the overlay", () => {
    const closed = jest.fn();
    component.closed.subscribe(closed);

    (
      fixture.nativeElement.querySelector(".td-close") as HTMLButtonElement
    ).click();

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
