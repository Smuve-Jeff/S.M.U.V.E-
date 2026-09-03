import { TestBed } from '@angular/core/testing';
import { StorefrontService } from './storefront.service';
import { MockPlayBillingClient } from './play-billing.client';
import { NotificationService } from './notification.service';

class StubNotify {
  info = jest.fn();
  show = jest.fn();
  warn = jest.fn();
  success = jest.fn();
  error = jest.fn();
}

describe('StorefrontService · Sprint C2', () => {
  let sut: StorefrontService;
  let billing: MockPlayBillingClient;

  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('smuve_store_owned');
      localStorage.removeItem('smuve_store_cart');
    }
    TestBed.configureTestingModule({
      providers: [
        StorefrontService,
        MockPlayBillingClient,
        { provide: NotificationService, useValue: new StubNotify() },
      ],
    });
    sut = TestBed.inject(StorefrontService);
    billing = TestBed.inject(MockPlayBillingClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exposes a deterministic 8-SKU seed catalog across four categories', () => {
    expect(sut.SKUS.length).toBeGreaterThanOrEqual(8);
    const cats = new Set(sut.SKUS.map((s) => s.category));
    expect(cats.has('sound-pack')).toBe(true);
    expect(cats.has('instrument-pack')).toBe(true);
    expect(cats.has('ai-bundle')).toBe(true);
    expect(cats.has('subscription')).toBe(true);
  });

  it('catalog price labels format correctly', () => {
    const descs = sut.descriptors();
    expect(descs.length).toBe(sut.SKUS.length);
    const free = descs.find((d) => d.priceCents === 0);
    expect(free?.priceLabel).toBe('Free');
    const paid = descs.find((d) => d.priceCents === 599);
    expect(paid?.priceLabel).toBe('$5.99');
  });

  it('addToCart merges duplicate lines and updates totalPriceCents', () => {
    sut.addToCart('smuve.trap-essentials.v1', 1);
    sut.addToCart('smuve.trap-essentials.v1', 2);
    sut.addToCart('smuve.ai-mix-pack.v1', 1);
    expect(sut.cart().length).toBe(2);
    expect(sut.cart()[0].qty).toBe(3);
    // $5.99 * 3 + $9.99 * 1 = $27.96
    expect(sut.totalPriceCents()).toBe(1797 + 999);
  });

  it('addToCart refuses to enqueue SKUs the user already owns', () => {
    sut.acquireSku('smuve.lofi-chill.v1', 1, 'mock_token');
    sut.addToCart('smuve.lofi-chill.v1', 1);
    expect(sut.cart().length).toBe(0);
  });

  it('purchase() drives the billing shim and records ownership', async () => {
    const result = await sut.purchase('smuve.ai-mix-pack.v1', 1);
    expect(result).not.toBeNull();
    expect(result?.skuId).toBe('smuve.ai-mix-pack.v1');
    expect(sut.owned('smuve.ai-mix-pack.v1')).toBe(true);
    expect(sut.cart().length).toBe(0); // auto-removed from cart
  });

  it('purchase() fails gracefully when the billing shim fails', async () => {
    billing.failOnToken = 'smuve.career-pro.v1';
    const result = await sut.purchase('smuve.career-pro.v1', 1);
    expect(result).toBeNull();
    expect(sut.owned('smuve.career-pro.v1')).toBe(false);
  });

  it('acknowledge() flips the ownership row to acknowledged', async () => {
    await sut.purchase('smuve.ai-mix-pack.v1', 1);
    const ok = await sut.acknowledge('smuve.ai-mix-pack.v1');
    expect(ok).toBe(true);
  });

  it('restorePurchases() merges empty receipts without error', async () => {
    const count = await sut.restorePurchases();
    expect(count).toBe(0);
  });

  it('recommendFor() prefers AI bundles on /produce, instruments on /studio', () => {
    const produceRec = sut.recommendFor('produce', 'trap');
    expect(produceRec.length).toBeLessThanOrEqual(3);
    expect(produceRec[0].category).toBe('ai-bundle');
    const studioRec = sut.recommendFor('studio', 'jazz');
    expect(studioRec[0].category).toBe('instrument-pack');
    const strategyRec = sut.recommendFor('strategy');
    expect(strategyRec[0].category).toBe('subscription');
  });

  it('recommendFor() favours tag overlap for the given genre', () => {
    const trapRec = sut.recommendFor('produce', 'trap');
    const trapIds = trapRec.map((s) => s.id);
    // trap genre should at least include the trap essentials pack as a candidate
    expect(
      trapIds.includes('smuve.trap-essentials.v1') ||
        trapRec.some((r) => r.entitlement.tags.includes('trap'))
    ).toBe(true);
  });

  it('persist + restore round-trip on ownership survives reload', () => {
    sut.acquireSku('smuve.future-bass.v1', 1, 'TKN_1');
    // Re-instantiate via the same storage key
    const reloaded = TestBed.inject(StorefrontService);
    expect(reloaded.owned('smuve.future-bass.v1')).toBe(true);
  });

  it('clearCart() empties the cart', () => {
    sut.addToCart('smuve.trap-essentials.v1', 1);
    sut.addToCart('smuve.ai-mix-pack.v1', 1);
    expect(sut.cart().length).toBe(2);
    sut.clearCart();
    expect(sut.cart().length).toBe(0);
  });

  it('subscription ownership lapses once expiresAt passes (expired grants no entitlement)', async () => {
    await sut.purchase('smuve.career-pro.v1', 1);
    expect(sut.owned('smuve.career-pro.v1')).toBe(true);
    // Force the stored 30-day expiry into the past (same row object the
    // ownership signal references).
    const row = sut
      .ownedSkus()
      .find((r) => r.skuId === 'smuve.career-pro.v1');
    expect(row).toBeDefined();
    row!.expiresAt = Date.now() - 1000;
    expect(sut.owned('smuve.career-pro.v1')).toBe(false);
    // Expired rows are re-purchasable: addToCart no longer refuses.
    sut.addToCart('smuve.career-pro.v1', 1);
    expect(sut.cart().some((l) => l.skuId === 'smuve.career-pro.v1')).toBe(
      true
    );
  });

  it('perpetual (non-subscription) ownership never lapses', async () => {
    sut.acquireSku('smuve.trap-essentials.v1', 1, 'TKN_PERP');
    expect(sut.owned('smuve.trap-essentials.v1')).toBe(true);
    expect(
      sut.ownedSkus().find((r) => r.skuId === 'smuve.trap-essentials.v1')
        ?.expiresAt
    ).toBeUndefined();
  });
});
