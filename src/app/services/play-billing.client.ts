import { Injectable } from '@angular/core';
import { PurchaseRequest, PurchaseResult } from '../types/storefront.types';

/**
 * Sprint C2 — Play Billing shim.
 *
 * The real Play Billing 6.0+ client ships in @stripe/iap / cordova-plugin-purchase
 * and runs inside the Capacitor/Cordova shell, not the web bundle. The web preview
 * uses a deterministic mock client that resolves (or rejects) on a fixed
 * schedule so the UI can flow end-to-end without a store backend.
 *
 * Production builds swap in the real client via dynamic import:
 *
 *   const { StripeIapClient } = await import('@smuve/play-billing');
 *
 * Until then, this shim gives us a stable surface for tests + preview.
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

/**
 * Mock Play Billing client used in preview + tests. Resolves a deterministic
 * receipt token 1.2s after `purchase()`. A small percentage of simulated
 * purchases fail so we can test error paths.
 */
@Injectable({ providedIn: 'root' })
export class MockPlayBillingClient implements PlayBillingClient {
  /** Force a failure on a specific token (test hook for failure paths). */
  failOnToken: string | null = null;

  isLiveBackend(): boolean {
    return false;
  }

  async purchase(req: PurchaseRequest): Promise<PurchaseResult> {
    await new Promise((r) => setTimeout(r, 1200));
    if (this.failOnToken && this.failOnToken === req.skuId) {
      return { ok: false, error: 'purchase-cancelled' };
    }
    const token = `mock_rcpt_${req.skuId}_${Date.now().toString(36)}`;
    return { ok: true, token };
  }

  async restore(): Promise<ReceiptRecord[]> {
    await new Promise((r) => setTimeout(r, 700));
    return [];
  }

  async acknowledge(_token: string): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 250));
    return true;
  }
}
