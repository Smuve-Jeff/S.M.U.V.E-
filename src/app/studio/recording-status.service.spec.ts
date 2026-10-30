import { TestBed } from "@angular/core/testing";
import { RecordingStatusService } from "./recording-status.service";
import { AudioEngineService } from "../services/audio-engine.service";
import { LoggingService } from "../services/logging.service";

describe("RecordingStatusService", () => {
  let service: RecordingStatusService;

  beforeEach(() => {
    jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    TestBed.configureTestingModule({
      providers: [
        RecordingStatusService,
        { provide: AudioEngineService, useValue: { masterAnalyser: null } },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });

    service = TestBed.inject(RecordingStatusService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    jest.restoreAllMocks();
  });

  it("starts idle", () => {
    expect(service.isRecording()).toBe(false);
    expect(service.recordingCount()).toBe(0);
    expect(service.recordingLabel()).toBe("");
    expect(service.recordingDetail()).toBe("");
    expect(service.recordingSource()).toEqual({ type: "none" });
  });

  it("names the track and input behind a transport pass", () => {
    service.beginRecording("transport", {
      type: "transport",
      trackId: "track-1",
      trackName: "Lead Vocal",
      inputLabel: "Scarlett 2i2",
      captureMode: "input",
    });

    expect(service.isRecording()).toBe(true);
    expect(service.recordingLabel()).toBe("Rec: Lead Vocal");
    expect(service.recordingDetail()).toBe(
      "Track: Lead Vocal · Scarlett 2i2",
    );
  });

  it("identifies the component, its target and its real capture bus", () => {
    service.beginRecording("component-recording", {
      type: "component",
      componentId: "drum-machine",
      componentLabel: "Drum Machine",
      targetLabel: "New arrangement track",
      inputLabel: "Studio master output",
      captureMode: "master",
    });

    expect(service.recordingLabel()).toBe("Rec: Drum Machine");
    expect(service.recordingDetail()).toBe(
      "Target: New arrangement track · Studio master output",
    );
  });

  it("counts simultaneous recorders without hiding either one", () => {
    service.beginRecording("transport", {
      type: "transport",
      trackName: "Lead Vocal",
      captureMode: "input",
    });
    service.beginRecording("audio-recorder", {
      type: "audio-recorder",
      inputLabel: "USB Mic",
      takeNumber: 2,
    });

    expect(service.recordingCount()).toBe(2);
    expect(service.recordingLabel()).toBe("Rec: Audio Recorder Take 2 +1");
    expect(service.recordingDetail()).toBe("Lead Vocal · Audio Recorder Take 2");
  });

  it("updates one owner in place instead of duplicating it", () => {
    service.beginRecording("microphone-interface", {
      type: "mic",
      channelId: "mic-1",
      channelLabel: "Lead Vox",
      inputLabel: "Focusrite",
      capturePath: "Processed vocal chain",
      paused: false,
    });
    service.updateRecordingSource("microphone-interface", {
      type: "mic",
      channelId: "mic-1",
      channelLabel: "Lead Vox",
      inputLabel: "Focusrite",
      capturePath: "Processed vocal chain",
      paused: true,
    });

    expect(service.recordingCount()).toBe(1);
    expect(service.recordingDetail()).toContain("Paused");
  });

  it("removes only the owner that stopped", () => {
    service.beginRecording("transport", {
      type: "transport",
      trackName: "Lead Vocal",
    });
    service.beginRecording("dj-deck", { type: "dj-deck", deckId: "master" });

    service.endRecording("transport");

    expect(service.recordingCount()).toBe(1);
    expect(service.recordingLabel()).toBe("Rec: Deck MASTER");
    expect(service.recordingDetail()).toBe("Master mix");
  });

  it("keeps the legacy single-source entry points working", () => {
    service.setRecordingSource({
      type: "performer",
      takeNumber: 3,
      trackName: "Keys",
    });

    expect(service.recordingLabel()).toBe("Rec: Performance Take 3");
    expect(service.recordingDetail()).toBe("Take 3 · Track: Keys");

    service.clearRecordingSource("performer");
    expect(service.isRecording()).toBe(false);
  });

  it("names every destination track a transport pass writes to", () => {
    const destinations = [
      { trackId: "a", trackName: "Lead" },
      { trackId: "b", trackName: "Bass" },
    ];
    service.setRecordDestinations(destinations);
    service.beginRecording("transport", {
      type: "transport",
      trackId: "a",
      trackName: "Lead",
      inputLabel: "Microphone input",
      captureMode: "input",
      destinations,
    });

    expect(service.recordingLabel()).toBe("Rec: Lead +1");
    expect(service.recordingDetail()).toBe(
      "Tracks: Lead, Bass · Microphone input",
    );
    expect(service.isTrackReceivingTake("a")).toBe(true);
    expect(service.isTrackReceivingTake("b")).toBe(true);
    expect(service.isTrackReceivingTake("c")).toBe(false);

    // Ending the pass clears the strip highlights with it.
    service.endRecording("transport");
    expect(service.recordDestinations()).toEqual([]);
    expect(service.isTrackReceivingTake("a")).toBe(false);
  });

  it("tracks per-track record arm independently of live captures", () => {
    service.armTrack("track-1");
    expect(service.isTrackArmed("track-1")).toBe(true);

    service.toggleArmTrack("track-1");
    expect(service.isTrackArmed("track-1")).toBe(false);
  });
});
