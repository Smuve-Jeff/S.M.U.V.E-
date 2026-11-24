import { NotificationService } from './notification.service';
import { reportUnreadableStore, resetStorageNotices } from './storage-notice';

describe('NotificationService storage notices', () => {
  let created: NotificationService[] = [];

  const create = (): NotificationService => {
    const service = new NotificationService();
    created.push(service);
    return service;
  };

  beforeEach(() => {
    resetStorageNotices();
    jest.useFakeTimers();
  });

  afterEach(() => {
    for (const service of created) service.ngOnDestroy();
    created = [];
    jest.useRealTimers();
    resetStorageNotices();
  });

  it('shows a warning when a store could not be read, once per store', () => {
    const service = create();

    reportUnreadableStore('Your cart');
    reportUnreadableStore('Your cart');
    reportUnreadableStore('Your store purchases');

    const shown = service.notifications();
    expect(shown).toHaveLength(2);
    expect(shown[0]).toMatchObject({ type: 'warning' });
    expect(shown[0].message).toContain('Your cart could not be read');
    expect(shown[0].message).toContain('will not be saved');
    expect(shown[1].message).toContain('Your store purchases');
  });

  it('flushes a store that failed to read before the service existed', () => {
    // Boot-time reads finish before the notification layer is constructed.
    reportUnreadableStore('Your cart');
    reportUnreadableStore('Your cart');

    const service = create();

    expect(service.notifications()).toHaveLength(1);
    expect(service.notifications()[0]).toMatchObject({ type: 'warning' });
    expect(service.notifications()[0].message).toContain(
      'Your cart could not be read'
    );
  });

  it('does not replay buffered notices to a later subscriber', () => {
    reportUnreadableStore('Your cart');
    create();

    const second = create();
    expect(second.notifications()).toEqual([]);

    // New failures still reach every live listener.
    reportUnreadableStore('Your game ratings');
    expect(second.notifications()).toHaveLength(1);
  });

  it('stops receiving notices once destroyed', () => {
    const service = create();
    service.ngOnDestroy();

    reportUnreadableStore('Your cart');

    expect(service.notifications()).toEqual([]);
    // The failure was buffered for whoever subscribes next instead of being lost.
    const next = create();
    expect(next.notifications()).toHaveLength(1);
  });
});
