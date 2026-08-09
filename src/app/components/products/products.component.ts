import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * Placeholder destination for the lazy `/products` route mounted in
 * `app.routes.ts`. The storefront catalogue is managed from the S.M.U.V.E
 * 2.0 dashboard; this screen is reached from the marketing deep-links
 * and the S.M.U.V.E recommendations carousel. The full marketplace view
 * is delivered in a follow-up PR; for now this is a single-page shim so
 * the route resolves cleanly during the server-side build.
 */
@Component({
  selector: 'app-products',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="products-placeholder">
      <header class="ph-head">
        <h2>S.M.U.V.E Marketplace</h2>
        <p>Boutique storefront coming online soon. Your AI Producer will surface
          recommended merch, sample packs, and lyric books here.</p>
      </header>
      <div class="ph-grid" aria-hidden="true">
        <div class="ph-card"></div>
        <div class="ph-card"></div>
        <div class="ph-card"></div>
      </div>
    </section>
  `,
  styles: [
    `
      .products-placeholder {
        padding: clamp(1rem, 4vw, 2.5rem);
        max-width: 980px;
        margin: 0 auto;
      }
      .ph-head h2 {
        margin: 0 0 0.5rem;
        font-weight: 800;
        letter-spacing: -0.01em;
      }
      .ph-head p {
        margin: 0 0 1.5rem;
        opacity: 0.78;
      }
      .ph-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
      }
      .ph-card {
        aspect-ratio: 4 / 5;
        border-radius: 18px;
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(255, 255, 255, 0.06), transparent 60%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
    `,
  ],
})
export class ProductsComponent {}
