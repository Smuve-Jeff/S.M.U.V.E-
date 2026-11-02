import { Injectable } from '@angular/core';
import { PurchaseRequest, PurchaseResult } from '../types/storefront.types';

/**
 * Store billing contract. The shipped client is the native Google Play
 * implementation; the deterministic mock remains available only when a test
 * explicitly injects it with `StorefrontService.setBilling()`.
 */
export interface PlayBillingClient {
  /** Begin a purchase flow. Resolves with a receipt token on success. */
  purchase(req: PurchaseRequest): Promise<PurchaseResult>;
  /** Refresh ownership from the store (RESTORE_PURCHASES). */
  restore(): Promise<ReceiptRecord[]>;
  /** Confirm an owned purchase so Google knows we shipped the bits. */
  acknowledge(token: string): Promise<boolean>;
  /** True when the real Play client is reachable. */
  isLiveBackend(): boolean;
}

export interface ReceiptRecord {
  skuId: string;
  token: string;
  acquiredAt: number;
  qty: number;
}

interface NativePlayBillingPlugin {
  purchase(options: { skuId: string; qty: number }): Promise<{
    ok: boolean;
    token?: string;
    skuId?: string | null;
    qty?: number;
    acquiredAt?: number;
    error?: string;
  }>;
  restore(): Promise<{ purchases: ReceiptRecord[] }>;
  acknowledge(options: { token: string }): Promise<{ ok: boolean }>;
}

/**
 * Google Play Billing through the Capacitor bridge.
 *
 * A browser/PWA has no Play Billing connection, so the web build reports that
 * honestly instead of minting a fake receipt. The storefront surfaces the
 * message and leaves ownership untouched.
 */
@Injectable({ providedIn: 'root' })
export class NativePlayBillingClient implements PlayBillingClient {
  private plugin: NativePlayBillingPlugin | null = null;
  private pluginPromise: Promise<NativePlayBillingPlugin | null> | null = null;

  isLiveBackend(): boolean {
    return this.isNative();
  }

  async purchase(req: PurchaseRequest): Promise<PurchaseResult> {
    const plugin = await this.resolvePlugin();
    if (!plugin) {
      return {
        ok: false,
        error: 'Play Billing is available only in the Android app.',
      };
    }
    try {
      const result = await plugin.purchase({
        skuId: req.skuId,
        qty: Math.max(1, Math.floor(req.qty || 1)),
      });
      if (!result?.ok || !result.token) {
        return {
          ok: false,
          error: result?.error || 'purchase-failed',
        };
      }
      return { ok: true, token: result.token };
    } catch (error: any) {
      return {
        ok: false,
        error:
          typeof error?.message === 'string'
            ? error.message
            : 'purchase-failed',
      };
    }
  }

  async restore(): Promise<ReceiptRecord[]> {
    const plugin = await this.resolvePlugin();
    if (!plugin) return [];
    try {
      const result = await plugin.restore();
      return Array.isArray(result?.purchases)
        ? result.purchases.filter(
            (row) =>
              !!row &&
              typeof row.skuId === 'string' &&
              typeof row.token === 'string',
          )
        : [];
    } catch {
      return [];
    }
  }

  async acknowledge(token: string): Promise<boolean> {
    const plugin = await this.resolvePlugin();
    if (!plugin || !token) return false;
    try {
      return !!(await plugin.acknowledge({ token })).ok;
    } catch {
      return false;
    }
  }

  private isNative(): boolean {
    return !!(globalThis as any).Capacitor?.isNativePlatform?.();
  }

  private async resolvePlugin(): Promise<NativePlayBillingPlugin | null> {
    if (!this.isNative()) return null;
    if (this.plugin) return this.plugin;
    if (this.pluginPromise) return this.pluginPromise;
    this.pluginPromise = (async () => {
      try {
        const { registerPlugin } = await import('@capacitor/core');
        this.plugin = registerPlugin<NativePlayBillingPlugin>('PlayBilling');
        return this.plugin;
      } catch {
        return null;
      }
    })();
    return this.pluginPromise;
  }
}

/**
 * Deterministic test/preview client. It is deliberately not the default
 * production binding; tests must opt in through `StorefrontService.setBilling`.
 */
@Injectable({ providedIn: 'root' })
export class MockPlayBillingClient implements PlayBillingClient {
  /** Force a failure on a specific token (test hook for failure paths). */
  failOnToken: string | null = null;

  isLiveBackend(): boolean {
    return false;
  }

  async purchase(req: PurchaseRequest): Promise<PurchaseResult> {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (this.failOnToken && this.failOnToken === req.skuId) {
      return { ok: false, error: 'purchase-cancelled' };
    }
    const token = `mock_rcpt_${req.skuId}_${Date.now().toString(36)}`;
    return { ok: true, token };
  }

  async restore(): Promise<ReceiptRecord[]> {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return [];
  }

  async acknowledge(_token: string): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return true;
  }
}
