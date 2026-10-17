import {
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { StorefrontService } from '../../services/storefront.service';
import { SkuCatalogEntry } from '../../types/storefront.types';

/**
 * Sprint C2 — StorefrontComponent
 *
 * Catalog grid with cart drawer and ownership mirror. Pulls SKUs from the
 * StorefrontService, exposes the cart total, and reacts to every ownership
 * change via signals so the UI never reads stale state.
 */
@Component({
  selector: 'app-storefront',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './storefront.component.html',
  styleUrls: ['./storefront.component.css'],
})
export class StorefrontComponent {
  public store = inject(StorefrontService);

  readonly filter = signal<'all' | 'sound-pack' | 'instrument-pack' | 'ai-bundle' | 'subscription'>(
    'all'
  );

  readonly busy = signal<Record<string, boolean>>({});
  readonly checkoutBusy = signal(false);

  readonly filtered = computed<SkuCatalogEntry[]>(() => {
    const f = this.filter();
    return f === 'all'
      ? [...this.store.SKUS]
      : this.store.SKUS.filter((s) => s.category === f);
  });

  readonly hasCart = computed(() => this.store.cart().length > 0);

  addToCart(sku: SkuCatalogEntry) {
    this.store.addToCart(sku.id, 1);
  }

  async purchaseNow(sku: SkuCatalogEntry) {
    if (this.busy()[sku.id]) return;
    this.busy.update((b) => ({ ...b, [sku.id]: true }));
    try {
      await this.store.purchase(sku.id, 1);
    } finally {
      this.busy.update((b) => ({ ...b, [sku.id]: false }));
    }
  }

  /** Purchase every line currently in the cart via the billing shim. */
  async checkoutCart() {
    if (this.checkoutBusy()) return;
    this.checkoutBusy.set(true);
    try {
      await this.store.checkoutCart();
    } finally {
      this.checkoutBusy.set(false);
    }
  }

  setFilter(value: typeof this.filter extends () => infer T ? T : never) {
    this.filter.set(value);
  }

  trackBySku(_: number, sku: SkuCatalogEntry): string {
    return sku.id;
  }

  cartUnitPriceCents(line: { unitPriceCents: number }): string {
    return `$${(line.unitPriceCents / 100).toFixed(2)}`;
  }

  totalPrice(): string {
    return `$${(this.store.totalPriceCents() / 100).toFixed(2)}`;
  }

  iconForCategory(cat: string): string {
    switch (cat) {
      case 'sound-pack':
        return 'graphic_eq';
      case 'instrument-pack':
        return 'piano';
      case 'ai-bundle':
        return 'auto_fix_high';
      case 'subscription':
        return 'rocket_launch';
      default:
        return 'shopping_bag';
    }
  }
}
