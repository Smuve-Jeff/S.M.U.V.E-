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
}

@Component({
  selector: 'app-legal-document-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-content">
      <h3 class="text-xl font-bold mb-4 text-white">
        {{ documentId ? 'Edit' : 'Create' }} Legal Document
      </h3>
      <div class="form-group">
        <label for="docTitle">Title</label>
        <input
          id="docTitle"
          type="text"
          [(ngModel)]="title"
          class="form-input"
          placeholder="e.g., Performance Agreement"
        />
      </div>
      <div class="form-group">
        <label for="docContent">Content</label>
        <textarea
          id="docContent"
          [(ngModel)]="content"
          class="form-textarea"
          rows="10"
          placeholder="Enter contract terms, clauses, etc."
        ></textarea>
      </div>
      <div class="flex justify-end gap-4 mt-6">
        <button (click)="cancel.emit()" class="cancel-button">Cancel</button>
        <button (click)="saveDocument()" class="action-button">Save</button>
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

  saveDocument() {
    const newDoc: LegalDocument = {
      id: this.documentId || `doc_${Date.now()}`,
      title: this.title,
      content: this.content,
    };
    this.save.emit(newDoc);
  }
}
