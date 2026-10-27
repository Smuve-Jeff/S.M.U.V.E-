import { HistoryService } from "./history.service";

/**
 * Undo history is not just an undo button any more: the transport bar shows the
 * named stack and restores any listed point. These tests pin the labels and the
 * jump-to-depth semantics the panel relies on.
 */
describe("HistoryService", () => {
  let service: HistoryService;
  let value: number;

  beforeEach(() => {
    service = new HistoryService();
    value = 0;
  });

  const step = (next: number, name: string) =>
    service.execute({
      name,
      execute: () => {
        const previous = value;
        value = next;
        // Re-execution (redo) must be able to replay from any state.
        void previous;
      },
      undo: () => {
        value = Math.max(0, value - 1);
      },
    });

  it("exposes the undo stack newest first", () => {
    step(1, "Add note");
    step(2, "Move clip");
    step(3, "Set volume");

    expect(service.undoLabels()).toEqual([
      "Set volume",
      "Move clip",
      "Add note",
    ]);
    expect(service.undoCount()).toBe(3);
    expect(service.redoLabels()).toEqual([]);
  });

  it("jumps back to the state before a listed step", () => {
    // Values set explicitly so the assertions read as states, not call counts.
    service.execute({
      name: "First",
      execute: () => (value = 1),
      undo: () => (value = 0),
    });
    service.execute({
      name: "Second",
      execute: () => (value = 2),
      undo: () => (value = 1),
    });
    service.execute({
      name: "Third",
      execute: () => (value = 3),
      undo: () => (value = 2),
    });

    // Clicking the middle entry ("Second") must restore the state before it.
    service.undoToDepth(service.undoCount() - 1 - 1);

    expect(value).toBe(1);
    expect(service.undoLabels()).toEqual(["First"]);
    // Redo list is newest-first too: the next redo is the one just undone.
    expect(service.redoLabels()).toEqual(["Second", "Third"]);
  });

  it("clamps jump requests to the available stack", () => {
    step(1, "One");
    service.undoToDepth(99);
    expect(service.undoCount()).toBe(1);
    expect(service.undoLabels()).toEqual(["One"]);

    service.undoToDepth(-5);
    expect(service.undoCount()).toBe(0);
    expect(service.undoLabels()).toEqual([]);
  });

  it("redoes back to a listed depth", () => {
    service.execute({
      name: "A",
      execute: () => (value = 1),
      undo: () => (value = 0),
    });
    service.execute({
      name: "B",
      execute: () => (value = 2),
      undo: () => (value = 1),
    });
    service.undoToDepth(0);
    expect(service.redoLabels()).toEqual(["A", "B"]);

    service.redoToDepth(1);
    expect(value).toBe(1);
    expect(service.undoLabels()).toEqual(["A"]);
    expect(service.redoLabels()).toEqual(["B"]);
  });

  it("drops the redo stack when a new edit lands after an undo", () => {
    step(1, "One");
    step(2, "Two");
    service.undo();
    expect(service.redoLabels()).toEqual(["Two"]);

    service.execute({ name: "New", execute: () => (value = 9), undo: () => (value = 1) });
    expect(service.redoLabels()).toEqual([]);
    expect(service.undoLabels()).toEqual(["New", "One"]);
  });
});
