import { Injectable, inject, signal } from '@angular/core';
import { LoggingService } from './logging.service';
import { LocalStorageService } from './local-storage.service';

export interface SyncQueueItem {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  endpoint: string;
  payload: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  channel?: 'default' | 'connector' | 'webhook';
  connectorId?: string;
  userId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class OfflineSyncService {
  private logger = inject(LoggingService);
  private localStorage = inject(LocalStorageService);

  private readonly SYNC_STORE = 'sync_queue';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 5000;

  isSyncing = signal(false);
  pendingCount = signal(0);
  deadLetterCount = signal(0);
  lastSyncAttempt = signal<number | null>(null);
  networkStatus = signal<'online' | 'offline'>('online');

  private syncInProgress = false;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor() {
    this.initNetworkListeners();
    void this.updatePendingCount();
  }

  private initNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    this.networkStatus.set(navigator.onLine ? 'online' : 'offline');

    this.onlineHandler = () => {
      this.networkStatus.set('online');
      this.logger.info('OfflineSync: Network restored - initiating sync');
      void this.processQueue();
    };

    this.offlineHandler = () => {
      this.networkStatus.set('offline');
      this.logger.info('OfflineSync: Network lost - queuing operations');
    };

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  /**
   * Queues an operation for offline sync.
   */
  async queueOperation(
    action: SyncQueueItem['action'],
    endpoint: string,
    payload: any,
    metadata: Pick<SyncQueueItem, 'channel' | 'connectorId' | 'userId'> = {}
  ): Promise<string> {
    const item: SyncQueueItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      action,
      endpoint,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: this.MAX_RETRIES,
      channel: metadata.channel || 'default',
      connectorId: metadata.connectorId,
      userId: metadata.userId,
    };

    await this.localStorage.saveItem(this.SYNC_STORE, item);
    await this.updatePendingCount();

    this.logger.info(`OfflineSync: Queued ${action} operation for ${endpoint}`);

    // If online, try to sync immediately
    if (this.networkStatus() === 'online') {
      void this.processQueue();
    }

    return item.id;
  }

  async queueConnectorSync(
    connectorId: string,
    endpoint: string,
    payload: any,
    userId?: string
  ): Promise<string> {
    return this.queueOperation('UPDATE', endpoint, payload, {
      channel: 'connector',
      connectorId,
      userId,
    });
  }

  /**
   * Processes the sync queue when network is available.
   */
  async processQueue(): Promise<void> {
    if (this.syncInProgress || this.networkStatus() === 'offline') {
      return;
    }

    this.syncInProgress = true;
    this.isSyncing.set(true);
    this.lastSyncAttempt.set(Date.now());

    try {
      const items = await this.localStorage.getAllItems(this.SYNC_STORE);
      const sortedItems = items.sort((a, b) => a.timestamp - b.timestamp);

      for (const item of sortedItems) {
        if (this.networkStatus() === 'offline') {
          break;
        }

        try {
          await this.executeSync(item);
          await this.removeFromQueue(item.id);
        } catch (error) {
          await this.handleSyncError(item, error);
        }
      }
    } catch (error) {
      this.logger.error('OfflineSync: Queue processing failed', error);
    } finally {
      this.syncInProgress = false;
      this.isSyncing.set(false);
      await this.updatePendingCount();
    }
  }

  private async executeSync(item: SyncQueueItem): Promise<void> {
    const method =
      item.action === 'DELETE'
        ? 'DELETE'
        : item.action === 'CREATE'
          ? 'POST'
          : 'PUT';

    const response = await fetch(item.endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: item.action !== 'DELETE' ? JSON.stringify(item.payload) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Sync failed with status ${response.status}`);
    }

    this.logger.info(
      `OfflineSync: Successfully synced ${item.action} to ${item.endpoint}`
    );
  }

  private async handleSyncError(
    item: SyncQueueItem,
    error: any
  ): Promise<void> {
    const updatedItem: SyncQueueItem = {
      ...item,
      retryCount: item.retryCount + 1,
    };

    if (updatedItem.retryCount >= item.maxRetries) {
      this.logger.error(
        `OfflineSync: Max retries exceeded for ${item.id}`,
        error
      );
      await this.moveToDeadLetter(item);
    } else {
      await this.localStorage.saveItem(this.SYNC_STORE, updatedItem);
      this.logger.warn(
        `OfflineSync: Retry ${updatedItem.retryCount}/${item.maxRetries} for ${item.id}`
      );
    }
  }

  private async moveToDeadLetter(item: SyncQueueItem): Promise<void> {
    await this.localStorage.saveItem('sync_dead_letter', {
      ...item,
      failedAt: Date.now(),
    });
    await this.removeFromQueue(item.id);
  }

  private async removeFromQueue(id: string): Promise<void> {
    await this.localStorage.deleteItem(this.SYNC_STORE, id);
  }

  private async updatePendingCount(): Promise<void> {
    try {
      const items = await this.localStorage.getAllItems(this.SYNC_STORE);
      const deadLetter =
        await this.localStorage.getAllItems('sync_dead_letter');
      this.pendingCount.set(items.length);
      this.deadLetterCount.set(deadLetter.length);
    } catch {
      this.pendingCount.set(0);
      this.deadLetterCount.set(0);
    }
  }

  /**
   * Gets the current queue status.
   */
  async getQueueStatus(): Promise<{
    pending: number;
    deadLetter: number;
    connectorPending: number;
    isOnline: boolean;
    lastSync: number | null;
  }> {
    const pending = await this.localStorage.getAllItems(this.SYNC_STORE);
    const deadLetter = await this.localStorage.getAllItems('sync_dead_letter');

    return {
      pending: pending.length,
      deadLetter: deadLetter.length,
      connectorPending: pending.filter((item) => item.channel === 'connector')
        .length,
      isOnline: this.networkStatus() === 'online',
      lastSync: this.lastSyncAttempt(),
    };
  }

  /**
   * Clears all pending sync operations (use with caution).
   */
  async clearQueue(): Promise<void> {
    const items = await this.localStorage.getAllItems(this.SYNC_STORE);
    for (const item of items) {
      await this.removeFromQueue(item.id);
    }
    await this.updatePendingCount();
    this.logger.info('OfflineSync: Queue cleared');
  }
}
