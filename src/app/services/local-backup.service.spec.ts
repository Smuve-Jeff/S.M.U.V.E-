import {
  LocalBackupService,
  BACKUP_FORMAT,
  BACKUP_VERSION,
} from './local-backup.service';

describe('LocalBackupService', () => {
  const service = new LocalBackupService();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('captures every local and session store with a checksum', () => {
    localStorage.setItem('smuve_store_cart', '[{"id":"pack-1"}]');
    sessionStorage.setItem('smuve.desk.telemetry.v1', '{"ar":{"opened":2}}');

    const backup = service.exportAll(new Date('2026-11-24T10:00:00Z'));

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.createdAt).toBe('2026-11-24T10:00:00.000Z');
    expect(backup.stores.map((entry) => entry.key).sort()).toEqual([
      'smuve.desk.telemetry.v1',
      'smuve_store_cart',
    ]);
    const cart = backup.stores.find((entry) => entry.key === 'smuve_store_cart');
    expect(cart?.storage).toBe('localStorage');
    expect(cart?.checksum).toMatch(/^[0-9a-f]{8}$/);
  });

  it('restores a backup round-trip, including session stores', () => {
    localStorage.setItem('smuve_game_ratings_v1', '{"statsByGame":{}}');
    sessionStorage.setItem('smuve.desk.telemetry.v1', '{"ar":{"opened":1}}');
    const json = service.toJson();

    localStorage.clear();
    sessionStorage.clear();

    const report = service.restore(json);

    expect(report.invalid).toBe(false);
    expect(report.restored).toBe(2);
    expect(report.unreadable).toEqual([]);
    expect(localStorage.getItem('smuve_game_ratings_v1')).toBe(
      '{"statsByGame":{}}'
    );
    expect(sessionStorage.getItem('smuve.desk.telemetry.v1')).toBe(
      '{"ar":{"opened":1}}'
    );
  });

  it('refuses a tampered entry instead of writing corruption back', () => {
    localStorage.setItem('smuve_store_cart', '[]');
    const backup = service.exportAll();
    backup.stores[0].value = '[{"id":"injected"}]';
    localStorage.setItem('smuve_store_cart', 'keep me');

    const report = service.restore(JSON.stringify(backup));

    expect(report.restored).toBe(0);
    expect(report.unreadable).toEqual(['smuve_store_cart']);
    expect(localStorage.getItem('smuve_store_cart')).toBe('keep me');
  });

  it('rejects a file that is not a backup without touching storage', () => {
    localStorage.setItem('smuve_store_cart', '[]');

    const report = service.restore('{"hello":"world"}');

    expect(report.invalid).toBe(true);
    expect(report.restored).toBe(0);
    expect(localStorage.getItem('smuve_store_cart')).toBe('[]');
    expect(service.describe(report)).toContain('Nothing was changed');
  });

  it('rejects unparseable JSON', () => {
    expect(service.restore('{not json').invalid).toBe(true);
  });

  it('reports entries it could not write instead of failing the whole restore', () => {
    localStorage.setItem('smuve_store_cart', '[]');
    const json = service.toJson();
    localStorage.setItem('smuve_store_cart', '[]');

    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    const report = service.restore(json);

    expect(report.restored).toBe(0);
    expect(report.unreadable).toEqual(['smuve_store_cart']);
    expect(service.describe(report)).toContain('could not be restored');
  });
});
