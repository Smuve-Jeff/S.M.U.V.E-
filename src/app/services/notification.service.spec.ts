import { NotificationService } from './notification.service';
import { reportUnreadableStore, resetStorageNotices } from './storage-notice';

describe('NotificationService storage notices', () => {
  beforeEach(() => {
    resetStorageNotices();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetStorageNotices();
  });

  it('shows a warning when a store could not be read, once per store', () => {
    const service = new NotificationService();

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
});
