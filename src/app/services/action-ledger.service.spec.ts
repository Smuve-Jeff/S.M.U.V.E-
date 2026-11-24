import { ActionLedgerService } from './action-ledger.service';

const KEY = 'smuve.action.ledger.v1';

describe('ActionLedgerService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('records what ran and persists the trail', () => {
    const service = new ActionLedgerService();
    service.record('apply-mimic', 'Drake-inspired recipe applied');

    expect(service.history()).toHaveLength(1);
    expect(service.history()[0].action).toBe('apply-mimic');
    expect(service.history()[0].undoable).toBe(false);

    const reloaded = new ActionLedgerService();
    expect(reloaded.history()[0].detail).toBe('Drake-inspired recipe applied');
  });

  it('runs the inverse for the newest undoable action', () => {
    const service = new ActionLedgerService();
    const undo = jest.fn();
    service.record('tempo-90', 'Tempo set to 90', undo);
    service.record('chords', 'Chord bed replaced');

    expect(service.canUndo()).toBe(true);
    const undone = service.undoLast();

    expect(undone?.action).toBe('tempo-90');
    expect(undo).toHaveBeenCalledTimes(1);
    expect(service.history().map((entry) => entry.action)).toEqual(['chords']);
    // The inverse is gone with the entry.
    expect(service.undoLast()).toBeNull();
  });

  it('reports no undo when only non-reversible actions were recorded', () => {
    const service = new ActionLedgerService();
    service.record('desk-switch', 'Moved to the legal desk');

    expect(service.canUndo()).toBe(false);
    expect(service.undoLast()).toBeNull();
  });

  it('keeps a corrupt ledger instead of overwriting it', () => {
    localStorage.setItem(KEY, '{not json');
    const service = new ActionLedgerService();
    expect(service.readable).toBe(false);

    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    service.record('tempo-124', 'Tempo set to 124');

    expect(setItem).not.toHaveBeenCalledWith(KEY, expect.any(String));
    expect(localStorage.getItem(KEY)).toBe('{not json');
    expect(service.history()).toHaveLength(1);
  });
});
