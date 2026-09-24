import { TestBed } from "@angular/core/testing";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { AudioPlayerPlugin } from "@mediagrid/capacitor-native-audio";
import {
  RadioBackgroundAudioService,
  RadioBackgroundTrack,
} from "./radio-background-audio.service";

jest.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: jest.fn(),
  },
  registerPlugin: jest.fn(),
}));

type PluginMock = {
  [K in keyof AudioPlayerPlugin]: jest.Mock;
};

const createPluginMock = (): PluginMock =>
  ({
    create: jest.fn().mockResolvedValue({ success: true }),
    initialize: jest.fn().mockResolvedValue({ success: true }),
    changeAudioSource: jest.fn().mockResolvedValue(undefined),
    changeMetadata: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    onAudioEnd: jest.fn().mockResolvedValue({ callbackId: "audio-end" }),
    onPlaybackStatusChange: jest
      .fn()
      .mockResolvedValue({ callbackId: "playback-status" }),
  }) as unknown as PluginMock;

const track: RadioBackgroundTrack = {
  title: "Midnight Rotation",
  artist: "Smuve Jeff",
  source: "https://radio.example/live",
};

describe("RadioBackgroundAudioService", () => {
  let plugin: PluginMock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    plugin = createPluginMock();
    jest.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    jest.mocked(registerPlugin).mockReturnValue(plugin as never);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers and identifies the AudioPlayer native plugin", async () => {
    const service = TestBed.inject(RadioBackgroundAudioService);

    await expect(service.init()).resolves.toBe(true);

    expect(registerPlugin).toHaveBeenCalledTimes(1);
    expect(registerPlugin).toHaveBeenCalledWith("AudioPlayer");
    expect(service.available()).toBe(true);
    expect(service.canHandle("https://radio.example/live")).toBe(true);
  });

  it("stays on the web path when Capacitor is not native", async () => {
    jest.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const service = TestBed.inject(RadioBackgroundAudioService);

    await expect(service.init()).resolves.toBe(false);

    expect(registerPlugin).not.toHaveBeenCalled();
    expect(service.available()).toBe(false);
    expect(service.canHandle("https://radio.example/live")).toBe(false);
  });

  it("tears down a native player whose initialization fails", async () => {
    plugin.initialize.mockRejectedValueOnce(new Error("buffer failed"));
    const service = TestBed.inject(RadioBackgroundAudioService);

    await expect(service.load(track)).resolves.toBe(false);

    expect(plugin.create).toHaveBeenCalledTimes(1);
    expect(plugin.destroy).toHaveBeenCalledWith({
      audioId: "smuve-jeff-radio",
    });
    await expect(service.play()).resolves.toBe(false);
  });

  it("can load again after a failed initialization", async () => {
    plugin.initialize.mockRejectedValueOnce(new Error("buffer failed"));
    const service = TestBed.inject(RadioBackgroundAudioService);

    await expect(service.load(track)).resolves.toBe(false);
    await expect(service.load(track)).resolves.toBe(true);

    expect(plugin.create).toHaveBeenCalledTimes(2);
    expect(plugin.initialize).toHaveBeenCalledTimes(2);
    await expect(service.play()).resolves.toBe(true);
  });

  it("tears down the old player when a source change fails", async () => {
    plugin.changeAudioSource.mockRejectedValueOnce(new Error("source failed"));
    const service = TestBed.inject(RadioBackgroundAudioService);

    await expect(service.load(track)).resolves.toBe(true);
    await expect(
      service.load({ ...track, title: "Next Record" }),
    ).resolves.toBe(false);

    expect(plugin.destroy).toHaveBeenCalledWith({
      audioId: "smuve-jeff-radio",
    });
    await expect(service.play()).resolves.toBe(false);
  });

  it("rebinds native listeners after the player is destroyed", async () => {
    const service = TestBed.inject(RadioBackgroundAudioService);

    await expect(service.load(track)).resolves.toBe(true);
    await service.destroy();
    await expect(service.load(track)).resolves.toBe(true);

    expect(plugin.onAudioEnd).toHaveBeenCalledTimes(2);
    expect(plugin.onPlaybackStatusChange).toHaveBeenCalledTimes(2);
  });

  it("reports the native playback status through the status signal", async () => {
    const service = TestBed.inject(RadioBackgroundAudioService);

    await service.load(track);
    const [, onStatusChange] = plugin.onPlaybackStatusChange.mock.calls[0] as [
      unknown,
      (event: { status: "playing" }) => void,
    ];
    onStatusChange({ status: "playing" });

    expect(service.status()).toBe("playing");
  });
});
