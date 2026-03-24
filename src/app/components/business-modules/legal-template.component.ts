import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-legal-template',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="p-8 bg-brand-surface/50 rounded-3xl border border-white/10 animate-enter"
    >
      <div class="flex items-center gap-3 mb-6">
        <i class="fas fa-file-contract text-brand-primary"></i>
        <h2 class="text-2xl font-black text-white uppercase italic">
          S.M.U.V.E. <span class="text-brand-primary">LEGAL SUITE</span>
        </h2>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div class="space-y-6">
          <div
            class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4"
          >
            Template Library
          </div>
          <div class="space-y-4">
            <button
              *ngFor="let t of legalTemplates"
              (click)="selectedTemplate.set(t)"
              class="w-full p-6 rounded-2xl border transition-all text-left flex justify-between items-center group"
              [ngClass]="
                selectedTemplate()?.id === t.id
                  ? 'border-brand-primary bg-brand-primary/10'
                  : 'border-white/5 hover:border-white/20 bg-black/40'
              "
            >
              <div>
                <div
                  class="text-sm font-black text-white uppercase tracking-tight"
                >
                  {{ t.name }}
                </div>
                <div class="text-[9px] text-slate-500 font-bold uppercase">
                  {{ t.category }}
                </div>
              </div>
              <i
                class="fas fa-arrow-right text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-brand-primary"
              ></i>
            </button>
          </div>
        </div>

        <div *ngIf="selectedTemplate() as t" class="space-y-8 animate-enter">
          <div class="bg-black/60 rounded-3xl p-8 border border-white/10">
            <div
              class="flex justify-between items-start mb-6 border-b border-white/10 pb-4"
            >
              <h3 class="text-xl font-black text-white uppercase italic">
                {{ t.name }}
              </h3>
              <span
                class="text-[8px] font-black text-brand-primary uppercase tracking-widest border border-brand-primary/30 px-2 py-0.5 rounded"
                >AI PROTECTED</span
              >
            </div>

            <div
              class="space-y-6 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar"
            >
              <p
                class="text-xs text-slate-400 font-medium leading-relaxed italic"
              >
                "{{ t.description }}"
              </p>
              <div class="space-y-4">
                <div *ngFor="let field of t.fields" class="space-y-2">
                  <label
                    class="text-[10px] font-black text-silver-dim uppercase tracking-widest"
                    >{{ field.label }}</label
                  >
                  <input
                    type="text"
                    class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-brand-primary outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              (click)="generatePDF()"
              class="w-full mt-8 py-4 bg-brand-primary text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:scale-105 transition-all"
            >
              Generate Official Document
            </button>
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
      .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(16, 185, 129, 0.2);
        border-radius: 10px;
      }
    `,
  ],
})
export class LegalTemplateComponent {
  legalTemplates = [
    {
      id: 't1',
      name: 'Songwriting Split Sheet',
      category: 'Contract',
      description:
        'Establish ownership percentages for music and lyrics among collaborators.',
      fields: [
        { label: 'Song Title', name: 'title' },
        { label: 'Artist A Share', name: 'shareA' },
        { label: 'Artist B Share', name: 'shareB' },
      ],
    },
    {
      id: 't2',
      name: 'Work-for-Hire Agreement',
      category: 'Agreement',
      description:
        'Ensure you retain 100% of rights when hiring producers or session musicians.',
      fields: [
        { label: 'Contractor Name', name: 'contractor' },
        { label: 'Service Description', name: 'service' },
        { label: 'Payment Amount', name: 'payment' },
      ],
    },
    {
      id: 't3',
      name: 'Exclusive Master License',
      category: 'License',
      description:
        'Grant rights to sync or use the master recording while maintaining ownership.',
      fields: [
        { label: 'Licensee Name', name: 'licensee' },
        { label: 'Usage Term', name: 'term' },
        { label: 'Territory', name: 'territory' },
      ],
    },
  ];

  selectedTemplate = signal<any>(this.legalTemplates[0]);

  generatePDF() {
    alert(
      'S.M.U.V.E. AI generating official PDF... Security watermarks applied.'
    );
  }
}
