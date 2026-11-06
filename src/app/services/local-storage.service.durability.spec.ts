import { LocalStorageService } from './local-storage.service';

/**
 * Durable storage is the difference between "saved" and "saved until the
 * browser needs the space". These tests pin the honest states the Studio
 * status strip depends on, without needing a real IndexedDB.
 */
describe('LocalStorageService durable storage', () => {
  let installedListener: EventListener | undefined;
  let addEventListener: jest.SpyInstance;

  const setStorage = (storage: unknown) => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: storage,
    });
  };

  beforeEach(() => {
    // Capture (and suppress) the install listener so services built by other
    // cases cannot answer the event with their stale mocks.
    installedListener = undefined;
    addEventListener = jest
      .spyOn(window, 'addEventListener')
      .mockImplementation(((type: string, handler: EventListener) => {
        if (type === 'appinstalled') installedListener = handler;
      }) as typeof window.addEventListener);
  });

  afterEach(() => {
    addEventListener.mockRestore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).storage;
  });

  it('reports granted when the origin is already persistent', async () => {
    const persisted = jest.fn().mockResolvedValue(true);
    const persist = jest.fn();
    setStorage({ persisted, persist });

    const service = new LocalStorageService();
    await expect(service.requestDurableStorage()).resolves.toBe('granted');

    expect(service.durability()).toBe('granted');
    // Already-protected origins are not asked again.
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks once and shares the answer with every caller', async () => {
    const persist = jest.fn().mockResolvedValue(true);
    setStorage({ persisted: jest.fn().mockResolvedValue(false), persist });

    const service = new LocalStorageService();
    const [first, second] = await Promise.all([
      service.requestDurableStorage(),
      service.requestDurableStorage(),
    ]);

    expect(first).toBe('granted');
    expect(second).toBe('granted');
    expect(service.durability()).toBe('granted');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('surfaces a refusal instead of claiming the data is safe', async () => {
    setStorage({
      persisted: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue(false),
    });

    const service = new LocalStorageService();
    await expect(service.requestDurableStorage()).resolves.toBe('denied');

    expect(service.durability()).toBe('denied');
  });

  it('treats a throwing persist() as denied rather than crashing boot', async () => {
    setStorage({
      persisted: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockRejectedValue(new Error('permission denied')),
    });

    const service = new LocalStorageService();
    await expect(service.requestDurableStorage()).resolves.toBe('denied');

    expect(service.durability()).toBe('denied');
  });

  it('reports unsupported on browsers without the persistence API', async () => {
    setStorage(undefined);

    const service = new LocalStorageService();
    await expect(service.requestDurableStorage()).resolves.toBe(
      'unsupported'
    );

    expect(service.durability()).toBe('unsupported');
  });

  it('re-asks after install so an early refusal does not stay permanent', async () => {
    const persist = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    setStorage({ persisted: jest.fn().mockResolvedValue(false), persist });

    const service = new LocalStorageService();
    await expect(service.requestDurableStorage()).resolves.toBe('denied');

    expect(installedListener).toBeDefined();
    installedListener!(new Event('appinstalled'));

    await expect(service.requestDurableStorage()).resolves.toBe('granted');
    expect(service.durability()).toBe('granted');
    expect(persist).toHaveBeenCalledTimes(2);
  });
});
