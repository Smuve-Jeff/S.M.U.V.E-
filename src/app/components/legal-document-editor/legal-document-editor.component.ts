import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface LegalDocument {
  id: string;
  title: string;
  content: string;
  type?: 'Split Sheet' | 'Work-for-Hire' | 'Contract';
}

@Component({
  selector: 'app-legal-document-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-content bg-[#1a1a1a] p-6 border border-[#af25f4] shadow-[0_0_20px_rgba(175,37,244,0.3)]">
      <h3 class="text-2xl font-bold mb-6 text-[#af25f4] uppercase tracking-tighter italic">
        {{ documentId ? 'REDACT' : 'INITIALIZE' }} LEGAL PROTOCOL
      </h3>

      <div class="mb-6">
        <label class="block text-[10px] uppercase text-[#af25f4] mb-2 opacity-70">Template Selection</label>
        <div class="flex gap-2">
          <button (click)="loadTemplate('Split Sheet')" class="px-3 py-1 bg-[#af25f4]/10 border border-[#af25f4]/30 text-[10px] text-white hover:bg-[#af25f4]/20 transition-colors uppercase">Split Sheet</button>
          <button (click)="loadTemplate('Work-for-Hire')" class="px-3 py-1 bg-[#af25f4]/10 border border-[#af25f4]/30 text-[10px] text-white hover:bg-[#af25f4]/20 transition-colors uppercase">Work-for-Hire</button>
        </div>
      </div>

      <div class="form-group mb-4">
        <label for="docTitle" class="block text-[10px] uppercase text-[#af25f4] mb-1">Document Identifier</label>
        <input
          id="docTitle"
          type="text"
          [(ngModel)]="title"
          class="w-full bg-black border border-[#af25f4]/50 p-2 text-white text-xs focus:outline-none focus:border-[#af25f4] font-mono"
          placeholder="ENTER TITLE"
        />
      </div>

      <div class="form-group mb-4">
        <label for="docContent" class="block text-[10px] uppercase text-[#af25f4] mb-1">Legal Clauses & Metadata</label>
        <textarea
          id="docContent"
          [(ngModel)]="content"
          class="w-full bg-black border border-[#af25f4]/50 p-2 text-white text-[10px] focus:outline-none focus:border-[#af25f4] font-mono leading-relaxed"
          rows="12"
          placeholder="ENTER LEGAL CONTENT"
        ></textarea>
      </div>

      <div class="flex justify-end gap-3 mt-8">
        <button (click)="cancel.emit()" class="px-6 py-2 border border-red-900/50 text-red-500 text-xs uppercase hover:bg-red-900/20 transition-all">Abort</button>
        <button (click)="saveDocument()" class="px-6 py-2 bg-[#af25f4] text-black text-xs font-bold uppercase hover:bg-white transition-all shadow-[0_0_10px_rgba(175,37,244,0.5)]">Execute</button>
      </div>
    </div>
  `,
  styleUrls: ['./legal-document-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalDocumentEditorComponent {
  @Input() document?: LegalDocument;
  @Output() save = new EventEmitter<LegalDocument>();
  @Output() cancel = new EventEmitter<void>();

  documentId = '';
  title = '';
  content = '';

  ngOnInit() {
    if (this.document) {
      this.documentId = this.document.id;
      this.title = this.document.title;
      this.content = this.document.content;
    }
  }

  loadTemplate(type: 'Split Sheet' | 'Work-for-Hire') {
    if (type === 'Split Sheet') {
      this.title = 'Digital Split Sheet - Untitled Project';
      this.content = `# S.M.U.V.E 2.0 DIGITAL SPLIT SHEET
DATE: ${new Date().toLocaleDateString()}
PROJECT: [ENTER PROJECT NAME]

PARTIES & OWNERSHIP:
1. Artist: [NAME] - 50% (Composition), 50% (Master)
2. Producer: [NAME] - 50% (Composition), 50% (Master)

CLAUSES:
- All parties agree to register works with their respective PROs within 7 days.
- Master ownership is split equally unless otherwise specified.
- Unauthorized derivative works are strictly prohibited.

EXECUTED VIA S.M.U.V.E 2.0 LEGAL ENGINE.`;
    } else {
      this.title = 'Work-for-Hire Agreement - Session Musician';
      this.content = `# WORK-FOR-HIRE AGREEMENT
DATE: ${new Date().toLocaleDateString()}
HIRING PARTY: [ARTIST NAME]
CONTRACTOR: [SESSION MUSICIAN NAME]

TERMS:
- Contractor acknowledges that all services performed are "work-for-hire".
- Hiring Party retains 100% ownership of the Master and Composition.
- Contractor waives all rights to royalties and future claims.

PAYMENT:
- A one-time buyout fee of [AMOUNT] has been agreed upon.

EXECUTED VIA S.M.U.V.E 2.0 LEGAL ENGINE.`;
    }
  }

  saveDocument() {
    const newDoc: LegalDocument = {
      id: this.documentId || `doc_${Date.now()}`,
      title: this.title,
      content: this.content,
    };
    this.save.emit(newDoc);
  }
}
