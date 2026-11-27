import { SoundPadComponent } from "./sound-pad.component";

describe("SoundPadComponent", () => {
  let component: SoundPadComponent;

  beforeEach(() => {
    jest.useFakeTimers();
    component = new SoundPadComponent();
    component.name = "KICK";
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("triggers on click/keyboard and maps Shift+F10 to the assign menu", () => {
    const triggered = jest.fn();
    const assigned = jest.fn();
    component.padTriggered.subscribe(triggered);
    component.padLongPressed.subscribe(assigned);

    component.triggerPad();
    component.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(triggered).toHaveBeenCalledTimes(2);

    const event = new KeyboardEvent("keydown", {
      key: "F10",
      shiftKey: true,
      cancelable: true,
    });
    component.onKeyDown(event);
    expect(assigned).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not audition after a completed long press", () => {
    const triggered = jest.fn();
    const assigned = jest.fn();
    component.padTriggered.subscribe(triggered);
    component.padLongPressed.subscribe(assigned);

    component.onPointerDown({ pointerType: "touch" } as PointerEvent);
    jest.advanceTimersByTime(500);
    component.onPointerUp();
    component.triggerPad();

    expect(assigned).toHaveBeenCalledTimes(1);
    expect(triggered).not.toHaveBeenCalled();
  });

  it("ignores right-click presses and prevents the native context menu", () => {
    component.onPointerDown({
      pointerType: "mouse",
      button: 2,
    } as PointerEvent);
    jest.advanceTimersByTime(600);
    expect(component["pressTimer"]).toBeNull();

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    component.onContextMenu(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
