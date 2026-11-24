import {
  LOCAL_SCHEMA_VERSION,
  LocalSchemaService,
  StoreMigration,
} from './local-schema.service';

const STAMP = 'smuve.local.schema.v1';

describe('LocalSchemaService', () => {
  const service = new LocalSchemaService();

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('starts at version 0 when nothing has been stamped', () => {
    expect(service.currentVersion()).toBe(0);
  });

  it('upgrades a stored shape and stamps the version once', () => {
    localStorage.setItem('smuve_store_cart', '[{"packId":"pack-1"}]');
    const migrations: StoreMigration[] = [
      {
        key: 'smuve_store_cart',
        from: 0,
        migrate: (value) =>
          Array.isArray(value)
            ? value.map((entry) => ({
                id: (entry as { packId: string }).packId,
              }))
            : null,
      },
    ];

    const result = service.run(migrations);

    expect(result.from).toBe(0);
    expect(result.to).toBe(LOCAL_SCHEMA_VERSION);
    expect(result.migrated).toEqual(['smuve_store_cart']);
    expect(localStorage.getItem('smuve_store_cart')).toBe('[{"id":"pack-1"}]');
    expect(JSON.parse(localStorage.getItem(STAMP)!).version).toBe(
      LOCAL_SCHEMA_VERSION
    );

    // Already stamped: the migration cannot run twice.
    expect(service.run(migrations).migrated).toEqual([]);
  });

  it('leaves an unreadable record exactly as it is', () => {
    localStorage.setItem('smuve_store_cart', '{not json');
    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    const result = service.run([
      { key: 'smuve_store_cart', from: 0, migrate: () => [] },
    ]);

    expect(result.skipped).toEqual(['smuve_store_cart']);
    expect(setItem).not.toHaveBeenCalledWith(
      'smuve_store_cart',
      expect.any(String)
    );
    expect(localStorage.getItem('smuve_store_cart')).toBe('{not json');
  });

  it('lets a migration decline a record it does not own', () => {
    localStorage.setItem('smuve_store_cart', '{"other":"shape"}');

    const result = service.run([
      { key: 'smuve_store_cart', from: 0, migrate: () => null },
    ]);

    expect(result.skipped).toEqual(['smuve_store_cart']);
    expect(localStorage.getItem('smuve_store_cart')).toBe('{"other":"shape"}');
  });
});
