import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-merch-design-lab',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="p-8 bg-brand-surface/50 rounded-3xl border border-white/10 animate-enter"
    >
      <div class="flex items-center gap-3 mb-6">
        <i class="fas fa-palette text-brand-primary"></i>
        <h2 class="text-2xl font-black text-white uppercase italic">
          S.M.U.V.E. <span class="text-brand-primary">MERCH LAB</span>
        </h2>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div
          class="aspect-square bg-black/60 rounded-3xl border border-white/10 flex items-center justify-center overflow-hidden relative group"
        >
          <img
            [src]="currentDesign()"
            class="w-full h-full object-contain transition-transform group-hover:scale-110"
          />
          <div
            class="absolute inset-0 bg-brand-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <span
              class="text-[10px] font-black text-brand-primary uppercase tracking-widest bg-black/80 px-4 py-2 rounded-full border border-brand-primary/30"
              >Preview Mode</span
            >
          </div>
        </div>

        <div class="space-y-8">
          <div>
            <div
              class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4"
            >
              Select Template
            </div>
            <div class="flex gap-4">
              <button
                *ngFor="let t of templates"
                (click)="currentDesign.set(t.url)"
                class="w-16 h-16 rounded-xl border-2 transition-all p-1"
                [ngClass]="
                  currentDesign() === t.url
                    ? 'border-brand-primary bg-brand-primary/10'
                    : 'border-white/5 hover:border-white/20 bg-black/40'
                "
              >
                <img
                  [src]="t.url"
                  class="w-full h-full object-cover rounded-lg"
                />
              </button>
            </div>
          </div>

          <div>
            <div
              class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4"
            >
              AI Branding Pulse
            </div>
            <div class="space-y-4">
              <button
                (click)="generateAI()"
                class="w-full py-4 bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:border-brand-primary transition-all flex items-center justify-center gap-3"
              >
                <i class="fas fa-brain animate-pulse text-brand-primary"></i>
                Generate AI Variant
              </button>
            </div>
          </div>

          <div class="bg-black/40 p-6 rounded-2xl border border-white/5">
            <div
              class="text-[9px] font-black text-brand-primary uppercase tracking-widest mb-2"
            >
              S.M.U.V.E. Advice
            </div>
            <p class="text-xs text-slate-400 leading-relaxed font-medium">
              "High-contrast obsidian and neon emerald are performing 34% better
              for your genre profile. Stick to the 'Titanium-Noir' aesthetic for
              maximum impact."
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .animate-enter {
        animation: slide-up 0.4s ease-out;
      }
      @keyframes slide-up {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
  ],
})
export class MerchDesignLabComponent {
  templates = [
    {
      name: 'Oversized Tee',
      url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400',
    },
    {
      name: 'Classic Hoodie',
      url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400',
    },
    {
      name: 'Tote Bag',
      url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400',
    },
  ];

  currentDesign = signal(this.templates[0].url);

  generateAI() {
    alert(
      'AI Design Pulse active... analyzing sonic profile... generating neon variant.'
    );
  }
}
