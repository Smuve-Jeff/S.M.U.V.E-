import { setMidiInputHandler } from "./midi-input-chain";

describe("setMidiInputHandler", () => {
  const hardware = Symbol("hardware");
  const dj = Symbol("dj");

  it("delivers one message to every registered consumer", () => {
    const port: { onmidimessage: ((event: unknown) => void) | null } = {
      onmidimessage: null,
    };
    const received: string[] = [];
    setMidiInputHandler(port, hardware, (event) => {
      received.push(`hardware:${event.data[1]}`);
    });
    setMidiInputHandler(port, dj, (event) => {
      received.push(`dj:${event.data[1]}`);
    });

    port.onmidimessage?.({ data: [0x90, 60, 100] });

    expect(received).toEqual(["hardware:60", "dj:60"]);
  });

  it("leaves the other consumer attached when one detaches", () => {
    const port: { onmidimessage: ((event: unknown) => void) | null } = {
      onmidimessage: null,
    };
    const received: string[] = [];
    setMidiInputHandler(port, hardware, () => received.push("hardware"));
    setMidiInputHandler(port, dj, () => received.push("dj"));

    setMidiInputHandler(port, dj, null);
    port.onmidimessage?.({ data: [0x90, 64, 100] });

    expect(received).toEqual(["hardware"]);
  });

  it("restores a handler that existed before the chain", () => {
    const previous = jest.fn();
    const port: { onmidimessage: ((event: unknown) => void) | null } = {
      onmidimessage: previous,
    };
    setMidiInputHandler(port, hardware, jest.fn());

    setMidiInputHandler(port, hardware, null);

    expect(port.onmidimessage).toBe(previous);
  });
});
