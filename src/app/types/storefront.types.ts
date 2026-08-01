/**
 * Sprint C2 — Play Store / IAP type contracts.
 *
 * The StorefrontService exposes a deterministic catalog that maps to
 * simulated Play Billing products. Each SKU is owned by at most one
 * `OwnershipState` per device; ownership persists in localStorage so a
 * restored install feels familiar.
 */

export type SkuCategory =
  | 'sound-pack'
  | 'instrument-pack'
  | 'ai-bundle'
  | 'subscription';

export type SkuTier = 'starter' | 'pro' | 'legacy' | 'enterprise';

export interface SkuEntitlement {
  /** Short headline shown on the SKU card. */
  summary: string;
  /** Long-form card body. */
  description: string;
  /** Subtitles / sub-claims (max 4). */
  perks: string[];
  /** Bytes of install footprint (used to set user expectations). */
  sizeBytes: number;
  /** Genre tags used by `recommendFor()`. */
  tags: string[];
}

export interface SoundPackSku {
  id: string;
  category: 'sound-pack';
  tier: SkuTier;
  title: string;
  priceCents: number;
  icon: string;
  entitlement: SkuEntitlement;
  /** Optional bundle ids that this pack unlocks. */
  bundles?: string[];
}

export interface InstrumentPackSku {
  id: string;
  category: 'instrument-pack';
  tier: SkuTier;
  title: string;
  priceCents: number;
  icon: string;
  entitlement: SkuEntitlement;
}

export interface AiBundleSku {
  id: string;
  category: 'ai-bundle';
  tier: SkuTier;
  title: string;
  priceCents: number;
  icon: string;
  entitlement: SkuEntitlement;
  /** Which Ai features become unlimited (e.g. 'voice-preview', 'master'). */
  grants: string[];
}

export interface SubscriptionSku {
  id: string;
  category: 'subscription';
  tier: SkuTier;
  title: string;
  /** Recurring price in cents per month. */
  priceCents: number;
  icon: string;
  entitlement: SkuEntitlement;
  /** Highlighted feature names unlocked for the subscription window. */
  highlights: string[];
}

export type SkuCatalogEntry =
  | SoundPackSku
  | InstrumentPackSku
  | AiBundleSku
  | SubscriptionSku;

/** Plain descriptor used by the catalog UI for cheap filtering. */
export interface SkuDescriptor {
  id: string;
  category: SkuCategory;
  tier: SkuTier;
  title: string;
  priceCents: number;
  priceLabel: string;
  summary: string;
  icon: string;
  owned: boolean;
}

export interface OwnershipState {
  skuId: string;
  /** Epoch ms when acquired. */
  acquiredAt: number;
  /** Synthetic receipt token (Play Billing substitute). */
  receiptToken: string;
  /** Optional subscription period end (epoch ms) when applicable. */
  expiresAt?: number;
  acknowledge: boolean;
}

export interface CartLine {
  skuId: string;
  qty: number;
  /** Snapshot at the time of add (so price changes don't surprise the cart). */
  unitPriceCents: number;
}

export interface PurchaseRequest {
  skuId: string;
  qty: number;
}

export interface PurchaseResult {
  ok: boolean;
  /** Stable token when ok=true; error tag when ok=false. */
  token?: string;
  error?: string;
}

export interface ReceiptRecord {
  skuId: string;
  token: string;
  acquiredAt: number;
  qty: number;
}
