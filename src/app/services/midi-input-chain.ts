type MidiMessageHandler = (event: any) => void;

const CHAIN = Symbol.for("smuve.midiInputChain");

interface MidiInputChain {
  handlers: Map<symbol, MidiMessageHandler>;
  previous: MidiMessageHandler | null;
  dispatch: MidiMessageHandler;
}

/**
 * Attach one consumer to a Web MIDI input without replacing another.
 *
 * `MIDIPort.onmidimessage` holds a single callback. HardwareService, the DJ
 * mappings, MIDI learn and the clock all need the same controller, and direct
 * assignment meant the last service to initialize (or rescan) silently starved
 * the rest. Each consumer registers under its own key; removing one leaves the
 * others attached. A handler that existed before the chain is preserved.
 */
export function setMidiInputHandler(
  port: any,
  key: symbol,
  handler: MidiMessageHandler | null,
): void {
  if (!port) return;

  let chain: MidiInputChain | undefined = port[CHAIN];
  if (!chain) {
    const previous =
      typeof port.onmidimessage === "function" ? port.onmidimessage : null;
    const created: MidiInputChain = {
      handlers: new Map(),
      previous,
      dispatch: (event: any) => {
        for (const callback of [...created.handlers.values()]) {
          callback(event);
        }
      },
    };
    chain = created;
    Object.defineProperty(port, CHAIN, {
      value: created,
      configurable: true,
    });
    port.onmidimessage = created.dispatch;
  }

  if (handler) chain.handlers.set(key, handler);
  else chain.handlers.delete(key);

  if (chain.handlers.size === 0) {
    if (port.onmidimessage === chain.dispatch) {
      port.onmidimessage = chain.previous;
    }
    delete port[CHAIN];
    return;
  }

  // All in-app consumers go through this chain; if something replaced the
  // dispatcher, restore it so the remaining handlers keep receiving input.
  if (port.onmidimessage !== chain.dispatch) {
    port.onmidimessage = chain.dispatch;
  }
}
