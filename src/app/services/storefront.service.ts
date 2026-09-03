import { Injectable, computed, inject, signal } from '@angular/core';
import { NotificationService } from './notification.service';
import { MockPlayBillingClient, PlayBillingClient } from './play-billing.client';
import {
  CartLine,
  OwnershipState,
  ReceiptRecord,
  SkuCatalogEntry,
  SkuCategory,
  SkuDescriptor,
} from '../types/storefront.types';

/**
 * Sprint C2 — StorefrontService
 *
 * Deterministic, offline-friendly storefront backed by Play Billing. The
 * catalog ships hard-coded so the UI works without a backend round trip.
 * Ownership and cart state persist in localStorage so a restored install
 * feels familiar. The "Play Billing backend" is a thin shim (see
 * play-billing.client.ts); until production ships the real client, every
 * purchase resolves deterministically after 1.2s.
 *
 * Public surface:
 *   • SKUS signal: full catalog
 *   • descriptors: cheap UI summary
 *   • cart / addToCart / clearCart / totalPriceCents
 *   • ownedSkus / owned / acquireSku / restorePurchases
 *   • purchase(skuId, qty): drives billing
 *   • recommendFor(viewMode, profileGenre): top-3 SKUs
 */

const OWNERSHIP_KEY = 'smuve_store_owned';
const CART_KEY = 'smuve_store_cart';

interface PersistedOwnership {
  [skuId: string]: OwnershipState;
}

function priceLabel(cents: number): string {
  if (cents === 0) return 'Free';
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

function readOwnership(): PersistedOwnership {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OWNERSHIP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    /* storage unavailable */
  }
  return {};
}

function readCart(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(isCartLine);
    }
  } catch {
    /* ignore */
  }
  return [];
}

function isCartLine(x: any): x is CartLine {
  return (
    x &&
    typeof x === 'object' &&
    typeof x.skuId === 'string' &&
    typeof x.qty === 'number' &&
    typeof x.unitPriceCents === 'number'
  );
}

@Injectable({ providedIn: 'root' })
export class StorefrontService {
  private notify = inject(NotificationService);
  /** Injectable for tests — swap with a stub billing client. */
  private billing: PlayBillingClient = inject(MockPlayBillingClient);

  /**
   * Sprint C2 — seed catalog. Hard-coded so the UI works without a
   * backend round-trip. Eight SKUs across four categories.
   */
  readonly SKUS: readonly SkuCatalogEntry[] = [
    {
      id: 'smuve.trap-essentials.v1',
      category: 'sound-pack',
      tier: 'pro',
      title: 'Trap Essentials Vol. 1',
      priceCents: 599,
      icon: 'graphic_eq',
      entitlement: {
        summary: '120 hand-crafted trap one-shots, hats, snares, 808s.',
        description:
          'Six folders of pre-mixed trap drums and melodic one-shots. Drag-and-drop into the Sampler; works with the bundled pitch chain.',
        perks: [
          '120 drum one-shots',
          '20 melodic loops',
          'Velocity layers',
          'Drum sampler presets',
        ],
        sizeBytes: 124 * 1024 * 1024,
        tags: ['trap', 'hip-hop', 'drill'],
      },
      bundles: ['smuve.ai-mix-pack.v1'],
    } as SkuCatalogEntry,
    {
      id: 'smuve.lofi-chill.v1',
      category: 'sound-pack',
      tier: 'starter',
      title: 'Lo-Fi Chill Pack',
      priceCents: 0,
      icon: 'nightlight',
      entitlement: {
        summary: 'Free starter pack of mellow keys, vinyl crackle, and tape hits.',
        description:
          'A 30-piece starter pack tuned for chill hip-hop and jazzy R&B. Free for every signed-in artist.',
        perks: ['30 free samples', 'Tape FX presets', 'Vinyl noise loops'],
        sizeBytes: 38 * 1024 * 1024,
        tags: ['lo-fi', 'jazz', 'r&b'],
      },
    } as SkuCatalogEntry,
    {
      id: 'smuve.dubstep-bass.v1',
      category: 'sound-pack',
      tier: 'pro',
      title: 'Dubstep Bass Vault',
      priceCents: 1299,
      icon: 'shutter_speed',
      entitlement: {
        summary: 'High-energy growlers, reese basses, mid-bass stabs.',
        description:
          '200+ bass presets pre-routed through the algorithmic reverb so they pop in a club mix in seconds.',
        perks: [
          '200 bass samples',
          'Reese + growler chains',
          'MIDI bass loops',
          'Mastered reference buses',
        ],
        sizeBytes: 180 * 1024 * 1024,
        tags: ['dubstep', 'electronic', 'bass'],
      },
    } as SkuCatalogEntry,
    {
      id: 'smuve.future-bass.v1',
      category: 'sound-pack',
      tier: 'starter',
      title: 'Future Bass Sparkle',
      priceCents: 899,
      icon: 'auto_awesome',
      entitlement: {
        summary: 'Plucky leads, glassy pads, gated vocal chops.',
        description:
          'A focused starter pack for Future Bass producers chasing festival-sized drops without paying festival prices.',
        perks: ['150 samples', 'Vocal chop kits', 'Pluck chains'],
        sizeBytes: 96 * 1024 * 1024,
        tags: ['future-bass', 'pop', 'electronic'],
      },
    } as SkuCatalogEntry,
    {
      id: 'smuve.808-grand.v1',
      category: 'instrument-pack',
      tier: 'legacy',
      title: '808 Grand Piano',
      priceCents: 1499,
      icon: 'piano',
      entitlement: {
        summary: 'Multi-sampled concert grand with round-robin + velocities.',
        description:
          'Sampled in three velocity layers across the full 88-key range. Drop it into the Sampler or trigger via the piano roll worklet.',
        perks: [
          '88 keys × 3 velocities',
          'Round-robin voice pool',
          'Sustain + half-pedal CC',
        ],
        sizeBytes: 320 * 1024 * 1024,
        tags: ['piano', 'hip-hop', 'jazz', 'r&b'],
      },
    } as SkuCatalogEntry,
    {
      id: 'smuve.cello-quartet.v1',
      category: 'instrument-pack',
      tier: 'enterprise',
      title: 'Cello Quartet',
      priceCents: 1899,
      icon: 'queue_music',
      entitlement: {
        summary: 'Solo / duo / quartet articulations with legato and marcato.',
        description:
          'Sampled cello ensemble including solo, duo, quartet loops and articulations, ready for cinematic placement.',
        perks: [
          'Solo / duo / quartet',
          'Legato + marcato',
          'Sustained + spiccato',
          'Cinematic sting kits',
        ],
        sizeBytes: 410 * 1024 * 1024,
        tags: ['strings', 'cinematic', 'jazz'],
      },
    } as SkuCatalogEntry,
    {
      id: 'smuve.ai-mix-pack.v1',
      category: 'ai-bundle',
      tier: 'pro',
      title: 'AI Mix Master Pro',
      priceCents: 999,
      icon: 'auto_fix_high',
      entitlement: {
        summary: 'Unlock unlimited AI Mix Master runs and Voice Previews.',
        description:
          'Removes the per-session cap on AI Mix Master and chorus-hook voice previews. Includes the genre-aware mastering chain.',
        perks: [
          'Unlimited AI mix runs',
          'Unlimited voice previews',
          'Genre mastering presets',
          'Offline render priority',
        ],
        sizeBytes: 0,
        tags: ['ai', 'master', 'voice'],
      },
      grants: ['unlimited-mix-master', 'unlimited-voice-preview'],
    } as SkuCatalogEntry,
    {
      id: 'smuve.career-pro.v1',
      category: 'subscription',
      tier: 'pro',
      title: 'Career Pro',
      priceCents: 1499,
      icon: 'rocket_launch',
      entitlement: {
        summary: 'Monthly subscription: priority review + revenue forecasts + outreach.',
        description:
          'Unlocks the Career Pro intelligence layer — weekly market briefs, predictive revenue modelling, and curator outreach drafts.',
        perks: [
          'Weekly exec briefs',
          'Revenue model v2',
          'Curator outreach',
          'Priority catalog review',
        ],
        sizeBytes: 0,
        tags: ['career', 'strategy'],
      },
      highlights: ['RevenueForecaster', 'OutreachDrafter', 'ExecBrief'],
    } as SkuCatalogEntry,
  ];

  // ░░░ State ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  private readonly ownedMap = signal<PersistedOwnership>(readOwnership());
  private readonly cartLines = signal<CartLine[]>(readCart());

  readonly cart = this.cartLines.asReadonly();
  readonly ownedSkus = computed(() => Object.values(this.ownedMap()));

  readonly owned = (skuId: string): boolean => {
    const row = this.ownedMap()[skuId];
    if (!row) return false;
    // Subscriptions expire: a stored row past its expiresAt no longer
    // grants entitlement (re-purchasing overwrites the stale row). Read-
    // only check — never mutate state inside a computed evaluation.
    if (row.expiresAt !== undefined && row.expiresAt <= Date.now()) {
      return false;
    }
    return true;
  };

  readonly totalPriceCents = computed(() =>
    this.cartLines().reduce((acc, line) => acc + line.unitPriceCents * line.qty, 0)
  );

  readonly descriptors = computed<SkuDescriptor[]>(() =>
    this.SKUS.map((sku) => ({
      id: sku.id,
      category: sku.category,
      tier: sku.tier,
      title: sku.title,
      priceCents: sku.priceCents,
      priceLabel: priceLabel(sku.priceCents),
      summary: sku.entitlement.summary,
      icon: sku.icon,
      owned: this.owned(sku.id),
    }))
  );

  // ░░░ Cart ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

  addToCart(skuId: string, qty: number = 1): void {
    const sku = this.SKUS.find((s) => s.id === skuId);
    if (!sku) return;
    if (this.owned(skuId)) {
      this.notify.show(`${sku.title} already owned.`, 'info');
      return;
    }
    this.cartLines.update((lines) => {
      const existing = lines.find((l) => l.skuId === skuId);
      const next: CartLine[] = existing
        ? lines.map((l) =>
            l.skuId === skuId ? { ...l, qty: l.qty + qty } : l
          )
        : [...lines, { skuId, qty, unitPriceCents: sku.priceCents }];
      this.persistCart(next);
      return next;
    });
  }

  removeFromCart(skuId: string): void {
    this.cartLines.update((lines) => {
      const next = lines.filter((l) => l.skuId !== skuId);
      this.persistCart(next);
      return next;
    });
  }

  clearCart(): void {
    this.cartLines.set([]);
    this.persistCart([]);
  }

  // ░░░ Ownership / Billing ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

  private persistOwnership(map: PersistedOwnership): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(OWNERSHIP_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  private persistCart(lines: CartLine[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }

  /**
   * Sprint C2 — Drive a single purchase through the billing shim.
   * Returns the receipt token on success, caller decides ownership merge.
   */
  async purchase(skuId: string, qty: number = 1): Promise<ReceiptRecord | null> {
    const result = await this.billing.purchase({ skuId, qty });
    if (!result.ok || !result.token) {
      this.notify.show(
        `Purchase failed: ${result.error ?? 'unknown error'}`,
        'warning'
      );
      return null;
    }
    return this.acquireSku(skuId, qty, result.token);
  }

  /**
   * Check out every cart line through the billing shim. Lines that
   * succeed are promoted to ownership and removed from the cart; the
   * first failure stops the run (remaining lines stay queued for retry).
   * Lines whose SKU is already owned are skipped without re-billing.
   *
   * Returns `{ purchased, failed? }` where `failed` is the SKU id that
   * aborted the run, if any.
   */
  async checkoutCart(): Promise<{ purchased: number; failed?: string }> {
    const lines = [...this.cart()];
    if (lines.length === 0) return { purchased: 0 };

    let purchased = 0;
    for (const line of lines) {
      // Already owned (e.g. bought elsewhere mid-session) — drop quietly.
      if (this.owned(line.skuId)) {
        this.removeFromCart(line.skuId);
        continue;
      }
      const result = await this.billing.purchase({
        skuId: line.skuId,
        qty: line.qty,
      });
      if (!result.ok || !result.token) {
        this.notify.show(
          `Checkout failed: ${result.error ?? 'unknown error'}`,
          'warning'
        );
        return { purchased, failed: line.skuId };
      }
      this.acquireSku(line.skuId, line.qty, result.token);
      purchased += 1;
    }
    this.notify.show('Checkout complete — purchases unlocked.', 'success');
    return { purchased };
  }

  /** Promote a successful billing receipt into an ownership row. */
  acquireSku(skuId: string, qty: number, token: string): ReceiptRecord {
    const sku = this.SKUS.find((s) => s.id === skuId);
    const now = Date.now();
    const expiresAt =
      sku?.category === 'subscription' ? now + 30 * 24 * 60 * 60 * 1000 : undefined;
    const record: ReceiptRecord = {
      skuId,
      token,
      acquiredAt: now,
      qty,
    };
    this.ownedMap.update((map) => {
      const next: PersistedOwnership = {
        ...map,
        [skuId]: {
          skuId,
          acquiredAt: now,
          receiptToken: token,
          expiresAt,
          acknowledge: false,
        },
      };
      this.persistOwnership(next);
      return next;
    });
    this.removeFromCart(skuId);
    return record;
  }

  async acknowledge(skuId: string): Promise<boolean> {
    const row = this.ownedMap()[skuId];
    if (!row) return false;
    const ok = await this.billing.acknowledge(row.receiptToken);
    if (ok) {
      this.ownedMap.update((map) => {
        const next = { ...map, [skuId]: { ...row, acknowledge: true } };
        this.persistOwnership(next);
        return next;
      });
    }
    return ok;
  }

  async restorePurchases(): Promise<number> {
    const restored = await this.billing.restore();
    let count = 0;
    for (const r of restored) {
      this.acquireSku(r.skuId, r.qty, r.token);
      count += 1;
    }
    return count;
  }

  /** Inject a different billing client (test hook). */
  setBilling(client: PlayBillingClient): void {
    this.billing = client;
  }

  // ░░░ Recommender ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

  /**
   * Score each catalog entry against (viewMode, profileGenre). Top-3 wins.
   * View-mode score: produce → AI bundles, studio → instruments,
   * strategy/career → subscriptions. Genre score: tag overlap.
   */
  recommendFor(viewMode: string, profileGenre?: string): SkuCatalogEntry[] {
    const wantCategory: SkuCategory =
      viewMode === 'produce'
        ? 'ai-bundle'
        : viewMode === 'studio' || viewMode === 'piano-roll'
          ? 'instrument-pack'
          : viewMode === 'strategy' || viewMode === 'career'
            ? 'subscription'
            : 'sound-pack';

    const genre = (profileGenre ?? '').toLowerCase();
    const scored = this.SKUS.map((sku) => {
      const catScore = sku.category === wantCategory ? 4 : 0;
      const tierScore =
        sku.tier === 'pro' ? 1 : sku.tier === 'starter' ? 0.5 : 0.25;
      const tagScore = genre
        ? sku.entitlement.tags.some((t) => t.includes(genre)) ? 2 : 0
        : 0;
      const ownershipPenalty = this.owned(sku.id) ? -10 : 0;
      return { sku, score: catScore + tierScore + tagScore + ownershipPenalty };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map((entry) => entry.sku);
  }
}
