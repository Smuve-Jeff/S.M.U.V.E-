import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { HardwareService } from "../../services/hardware.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { MidiInputWidgetComponent } from "./midi-input-widget.component";

describe("MidiInputWidgetComponent", () => {
  const midiInputs = signal([{ id: "midi-1", name: "Keystation" }]);
  const recordLiveNote = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [MidiInputWidgetComponent],
      providers: [
        { provide: HardwareService, useValue: { midiInputs } },
        { provide: MusicManagerService, useValue: { recordLiveNote } },
      ],
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("shows connected devices and clears the note display after 1.5s", () => {
    const fixture = TestBed.createComponent(MidiInputWidgetComponent);
    const component = fixture.componentInstance;

    expect(component.hasDevices()).toBe(true);
    component.onNoteOn(61, 100);
    expect(component.lastNote()).toBe(61);
    expect(component.lastNoteLabel()).toBe("C#4");
    expect(component.lastVelocity()).toBe(100);
    expect(recordLiveNote).toHaveBeenCalledWith(61, 100);

    jest.advanceTimersByTime(1500);
    expect(component.lastNote()).toBeNull();
  });
});
