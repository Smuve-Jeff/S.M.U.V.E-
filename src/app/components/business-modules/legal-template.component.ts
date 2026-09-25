import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ArtistProfileFinetuneService } from '../../services/artist-profile-finetune.service';
import {
  LegalDocumentEditorComponent,
  type LegalDocument,
} from '../legal-document-editor/legal-document-editor.component';

const LEGAL_DRAFT_STORAGE_KEY = 'smuve.legal.drafts.v1';

@Component({
  selector: 'app-legal-template',
  standalone: true,
  imports: [CommonModule, LegalDocumentEditorComponent],
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

      <div
        class="mb-8 p-6 rounded-2xl border border-brand-primary/25 bg-black/40"
        *ngIf="legalReadiness() as legal"
      >
        <div class="flex items-center justify-between gap-4 mb-3">
          <div class="text-[10px] font-black text-brand-primary uppercase tracking-widest">
            Artist-Specific Legal Readiness
          </div>
          <div class="text-[10px] font-bold text-slate-400 uppercase">
            Profile evidence: {{ legal.completeness }}%
          </div>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed mb-4">
          {{ legal.directive }}
        </p>
        <ul class="space-y-2 mb-4">
          <li
            *ngFor="let tip of legal.tips"
            class="text-[11px] text-slate-400 flex gap-2"
          >
            <i class="fas fa-check text-brand-primary text-[9px] mt-1"></i>
            <span>{{ tip }}</span>
          </li>
        </ul>
        <div
          *ngIf="legal.missingSignals?.length"
          class="text-[10px] text-amber-400/80 uppercase font-bold"
        >
          Add to strengthen context:
          {{ legal.missingSignals.slice(0, 4).join(' · ') }}
        </div>
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

          <div class="space-y-4 pt-2">
            <div class="flex items-center justify-between gap-3">
              <div
                class="text-[10px] font-black text-slate-500 uppercase tracking-widest"
              >
                Drafting Desk
              </div>
              <button
                (click)="openDraft()"
                class="text-[9px] font-black text-brand-primary uppercase tracking-widest border border-brand-primary/30 rounded-full px-3 py-1 hover:bg-brand-primary/10 transition-all"
              >
                New Draft
              </button>
            </div>

            <div
              *ngIf="!drafts().length"
              class="text-[10px] text-slate-500 font-bold uppercase"
            >
              No documents drafted yet.
            </div>

            <div
              *ngFor="let draft of drafts()"
              class="p-4 rounded-2xl border border-white/5 bg-black/40 flex items-start justify-between gap-3"
            >
              <div class="min-w-0">
                <div
                  class="text-xs font-black text-white uppercase tracking-tight truncate"
                >
                  {{ draft.title || 'Untitled document' }}
                </div>
                <div
                  class="text-[9px] text-brand-primary font-bold uppercase tracking-widest"
                >
                  {{ draft.type || 'Document' }}
                </div>
              </div>
              <div class="flex gap-2 shrink-0">
                <button
                  (click)="openDraft(draft)"
                  class="text-[9px] font-black text-slate-300 uppercase hover:text-brand-primary transition-colors"
                >
                  Edit
                </button>
                <button
                  (click)="removeDraft(draft.id)"
                  class="text-[9px] font-black text-red-400/80 uppercase hover:text-red-400 transition-colors"
                >
                  Del
                </button>
              </div>
            </div>
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
            <button
              (click)="openDraft()"
              class="w-full mt-3 py-4 border border-brand-primary/40 text-brand-primary text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-brand-primary/10 transition-all"
            >
              Open Document Editor
            </button>
          </div>
        </div>
      </div>

      <!-- S.M.U.V.E. legal document editor — hosted modal surface -->
      <div
        *ngIf="editorOpen()"
        class="fixed inset-0 z-[70] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 md:p-8 overflow-y-auto"
      >
        <div class="w-full max-w-3xl">
          <app-legal-document-editor
            [document]="draftTarget()"
            (save)="saveDraft($event)"
            (cancel)="closeDraft()"
          ></app-legal-document-editor>
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

  private artistFinetune = inject(ArtistProfileFinetuneService);

  selectedTemplate = signal<any>(this.legalTemplates[0]);

  /** Legal drafting desk. Drafts persist so they survive the pipeline overlay. */
  drafts = signal<LegalDocument[]>(this.loadDrafts());
  draftTarget = signal<LegalDocument | null>(null);
  editorOpen = signal(false);

  /** Legal work is scoped to the artist's real revenue, collaborators, and boundaries. */
  legalReadiness = computed(() => {
    const knowledge = this.artistFinetune.knowledge();
    return {
      ...this.artistFinetune.directiveFor('legal'),
      completeness: knowledge.completeness,
      missingSignals: knowledge.missing,
    };
  });

  generatePDF() {
    alert(
      'S.M.U.V.E. AI generating official PDF... Security watermarks applied.'
    );
  }

  /** Opens the editor: an existing draft, or a blank one seeded from the library. */
  openDraft(doc?: LegalDocument) {
    this.draftTarget.set(doc ?? this.buildDraftSeed());
    this.editorOpen.set(true);
  }

  closeDraft() {
    this.editorOpen.set(false);
  }

  saveDraft(doc: LegalDocument) {
    const list = this.drafts();
    const index = list.findIndex((entry) => entry.id === doc.id);
    const next =
      index > -1
        ? list.map((entry, i) => (i === index ? doc : entry))
        : [doc, ...list];
    this.drafts.set(next);
    this.persistDrafts(next);
    this.closeDraft();
  }

  removeDraft(id: string) {
    const next = this.drafts().filter((entry) => entry.id !== id);
    this.drafts.set(next);
    this.persistDrafts(next);
  }

  private buildDraftSeed(): LegalDocument {
    const name: string = this.selectedTemplate()?.name ?? '';
    return {
      id: '',
      title: name,
      content: '',
      type: this.documentTypeFor(name),
    };
  }

  private documentTypeFor(name: string): LegalDocument['type'] {
    if (/split sheet/i.test(name)) return 'Split Sheet';
    if (/work-for-hire/i.test(name)) return 'Work-for-Hire';
    return 'Contract';
  }

  private loadDrafts(): LegalDocument[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(LEGAL_DRAFT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private persistDrafts(docs: LegalDocument[]) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        LEGAL_DRAFT_STORAGE_KEY,
        JSON.stringify(docs)
      );
    } catch {
      // Storage unavailable (private mode / quota) — drafts stay in memory.
    }
  }
}
