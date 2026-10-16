import { IdbRecordingSpillStore, RECORDING_CHUNK_STORE } from './recording-spill.store';
import type { CaptureSpillRecord } from './recording-capture-buffer';

const record = (id: string, sessionId: string, index: number): CaptureSpillRecord => ({
  id,
  sessionId,
  index,
  left: [Float32Array.from([index])],
  right: [Float32Array.from([index])],
});

const createStorage = (overrides: Record<string, any> = {}) => ({
  persistenceStatus: jest.fn().mockResolvedValue('ready'),
  saveItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockImplementation(async (_store: string, id: string) => ({ id })),
  getAllItems: jest.fn().mockResolvedValue([]),
  deleteItems: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('IdbRecordingSpillStore', () => {
  it('writes through the dedicated capture store and verifies the record landed', async () => {
    const storage = createStorage();
    const sut = new IdbRecordingSpillStore(storage as any);

    await sut.write(record('cap_a:0', 'cap_a', 0));

    expect(storage.saveItem).toHaveBeenCalledWith(
      RECORDING_CHUNK_STORE,
      expect.objectContaining({ id: 'cap_a:0', sessionId: 'cap_a' })
    );
    expect(storage.getItem).toHaveBeenCalledWith(RECORDING_CHUNK_STORE, 'cap_a:0');
  });

  it('refuses to report a successful spill when persistence is unavailable', async () => {
    // saveItem() is a silent no-op when IndexedDB is blocked, so a store that
    // trusted it would have the buffer discard audio it never wrote.
    const storage = createStorage({
      persistenceStatus: jest.fn().mockResolvedValue('blocked'),
    });
    const sut = new IdbRecordingSpillStore(storage as any);

    await expect(sut.write(record('cap_a:0', 'cap_a', 0))).rejects.toThrow(
      'Recording spill unavailable (blocked).'
    );
    expect(storage.saveItem).not.toHaveBeenCalled();
  });

  it('throws when the write did not actually persist', async () => {
    const storage = createStorage({ getItem: jest.fn().mockResolvedValue(null) });
    const sut = new IdbRecordingSpillStore(storage as any);

    await expect(sut.write(record('cap_a:0', 'cap_a', 0))).rejects.toThrow(
      'Recording spill did not persist.'
    );
  });

  it('reads back only the requested session', async () => {
    const storage = createStorage({
      getAllItems: jest
        .fn()
        .mockResolvedValue([
          record('cap_a:0', 'cap_a', 0),
          record('cap_b:0', 'cap_b', 0),
          record('cap_a:1', 'cap_a', 1),
        ]),
    });
    const sut = new IdbRecordingSpillStore(storage as any);

    const records = await sut.readAll('cap_a');

    expect(records.map((r) => r.id)).toEqual(['cap_a:0', 'cap_a:1']);
  });

  it('clears one session without touching another take', async () => {
    const storage = createStorage({
      getAllItems: jest
        .fn()
        .mockResolvedValue([record('cap_a:0', 'cap_a', 0), record('cap_b:0', 'cap_b', 0)]),
    });
    const sut = new IdbRecordingSpillStore(storage as any);

    await sut.clear('cap_a');

    expect(storage.deleteItems).toHaveBeenCalledWith(RECORDING_CHUNK_STORE, [
      'cap_a:0',
    ]);
  });

  it('does not run a delete transaction when the session spilled nothing', async () => {
    const storage = createStorage({ getAllItems: jest.fn().mockResolvedValue([]) });
    const sut = new IdbRecordingSpillStore(storage as any);

    await sut.clear('cap_empty');

    expect(storage.deleteItems).not.toHaveBeenCalled();
  });
});
