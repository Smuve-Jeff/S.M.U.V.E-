import { NativeMidiService } from "./native-midi.service";

jest.mock("@capacitor/core", () => ({
  registerPlugin: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerPlugin } = require("@capacitor/core") as {
  registerPlugin: jest.Mock;
};

const DEVICES = [
  {
    id: "1",
    name: "Keys",
    manufacturer: "ACME",
    sendPorts: [0],
    receivePorts: [0, 1],
  },
];

describe("NativeMidiService", () => {
  let listeners: Record<string, Array<(event?: any) => void>>;
  let plugin: {
    listMidiDevices: jest.Mock;
    openSource: jest.Mock;
    sendMidi: jest.Mock;
    closeMidi: jest.Mock;
    addListener: jest.Mock;
    removeFns: jest.Mock[];
  };

  beforeEach(() => {
    listeners = {};
    plugin = {
      listMidiDevices: jest.fn().mockResolvedValue({ devices: DEVICES }),
      openSource: jest.fn().mockResolvedValue(undefined),
      sendMidi: jest.fn().mockResolvedValue(undefined),
      closeMidi: jest.fn().mockResolvedValue(undefined),
      addListener: jest.fn().mockImplementation((event: string, cb: (e?: any) => void) => {
        (listeners[event] ??= []).push(cb);
        const removeFn = jest.fn().mockResolvedValue(undefined);
        plugin.removeFns.push(removeFn);
        return { remove: removeFn };
      }),
      removeFns: [],
    };
    registerPlugin.mockReturnValue(plugin);
    (globalThis as any).Capacitor = { isNativePlatform: () => true };
  });

  afterEach(() => {
    delete (globalThis as any).Capacitor;
    jest.clearAllMocks();
  });

  it("registers the native plugin and lists devices", async () => {
    const service = new NativeMidiService();

    await expect(service.init()).resolves.toBe(true);

    expect(registerPlugin).toHaveBeenCalledWith("StudioNative");
    expect(service.available()).toBe(true);
    expect(service.devices()).toEqual(DEVICES);
  });

  it("stays unavailable off a native platform and leaves Web MIDI alone", async () => {
    delete (globalThis as any).Capacitor;
    const service = new NativeMidiService();

    await expect(service.init()).resolves.toBe(false);

    expect(registerPlugin).not.toHaveBeenCalled();
    expect(service.available()).toBe(false);
  });

  it("opens every receive port and tolerates one claimed by another app", async () => {
    const service = new NativeMidiService();
    await service.init();
    plugin.openSource.mockRejectedValueOnce(new Error("claimed"));

    await service.connectInputs();

    expect(plugin.openSource).toHaveBeenCalledWith({
      deviceId: "1",
      portNumber: 0,
    });
    expect(plugin.openSource).toHaveBeenCalledWith({
      deviceId: "1",
      portNumber: 1,
    });
  });

  it("routes native messages to the shared input bus callback", async () => {
    const service = new NativeMidiService();
    const seen: Array<{ data: number[]; deviceId: string }> = [];
    service.onMessage = (data, deviceId) => seen.push({ data, deviceId });
    await service.init();

    listeners["midiMessage"][0]({ deviceId: "1", data: [0x90, 60, 100] });

    expect(seen).toEqual([{ data: [0x90, 60, 100], deviceId: "1" }]);
  });

  it("re-enumerates when the native side reports a plug or unplug", async () => {
    const service = new NativeMidiService();
    await service.init();

    listeners["midiDevicesChanged"][0]();
    await Promise.resolve();

    expect(plugin.listMidiDevices).toHaveBeenCalledTimes(2);
  });

  it("sends bytes and reports failure without throwing", async () => {
    const service = new NativeMidiService();
    await service.init();

    await expect(service.send("1", 0, [0x90, 60, 100])).resolves.toBe(true);
    plugin.sendMidi.mockRejectedValueOnce(new Error("gone"));
    await expect(service.send("1", 0, [0x80, 60, 0])).resolves.toBe(false);
  });

  it("closes the ports and removes both listeners", async () => {
    const service = new NativeMidiService();
    await service.init();

    await service.close();

    expect(plugin.closeMidi).toHaveBeenCalled();
    expect(plugin.removeFns).toHaveLength(2);
    expect(plugin.removeFns[0]).toHaveBeenCalled();
    expect(plugin.removeFns[1]).toHaveBeenCalled();
  });
});
