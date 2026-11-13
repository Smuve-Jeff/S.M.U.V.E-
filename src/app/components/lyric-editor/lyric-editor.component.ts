import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReleasePipelineService } from '../../services/release-pipeline.service';

const LYRIC_DRAFT_KEY = 'smuve_lyric_draft';
const WRITER_PAGES_KEY = 'smuve_writer_pages_v1';

interface WriterPage {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

interface StoredWriterPages {
  pages?: unknown;
  activePageId?: unknown;
  savedAt?: unknown;
}

@Component({
  selector: 'app-lyric-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lyric-editor.component.html',
  styleUrls: ['./lyric-editor.component.css'],
})
export class LyricEditorComponent {
  private releaseService = inject(ReleasePipelineService);

  /** The active page. These two signals remain the editor's live buffers. */
  lyrics = signal<string>('');
  trackTitle = signal<string>('Untitled Page');

  /** Every page in this writer session, saved together in this browser. */
  pages = signal<WriterPage[]>([
    { id: 'page-1', title: 'Untitled Page', body: '', updatedAt: 0 },
  ]);
  activePageId = signal('page-1');
  pageCount = computed(() => this.pages().length);
  wordCount = computed(() => this.countWords(this.lyrics()));
  totalWordCount = computed(() =>
    this.pages().reduce((total, page) => total + this.countWords(page.body), 0)
  );

  /**
   * Fixed writing prompts, not generated lines: the editor has no model call,
   * so the panel must not present these as an analysis of the artist's lyrics.
   */
  rhymeStarters = signal<string[]>([
    'Try a more aggressive metaphor for the second verse.',
    'Rhyme pair: "velocity" with "atrocity"',
    'The hook could use a more rhythmic syncopation.',
  ]);

  /** S.M.U.V.E.'s book-writing and publishing guidance for this workspace. */
  bookTips = signal<string[]>([
    'Premise first: protagonist + want + obstacle + stakes. If it fits in one sentence, the book knows what it is.',
    'Give every scene a goal, conflict and turn. If nothing changes, it is summary — useful glue, not a scene.',
    'Draft forward before you polish. Then revise in passes: structure, scenes, line edit, proofread.',
    'Use one page per chapter or scene and name it. Page order is easier to fix than lost text.',
    'Publishing is a business choice: traditional, small press or self-publish. Check current ISBN, distribution, fee and rights terms yourself.',
  ]);

  savedAt = signal<number | null>(null);
  saveError = signal('');

  private pageSequence = 1;

  constructor() {
    this.restoreWriterState();
  }

  /** Save every page in this browser. This is not a release-pipeline commit. */
  saveLyrics() {
    try {
      const savedAt = Date.now();
      this.flushActivePage(savedAt);
      const pages = this.pages();

      localStorage.setItem(
        WRITER_PAGES_KEY,
        JSON.stringify({ pages, activePageId: this.activePageId(), savedAt })
      );
      // Keep the original single-draft key current for older builds of the Pad.
      localStorage.setItem(
        LYRIC_DRAFT_KEY,
        JSON.stringify({
          lyrics: this.lyrics(),
          title: this.trackTitle(),
          savedAt,
        })
      );

      this.savedAt.set(savedAt);
      this.saveError.set('');
    } catch {
      this.saveError.set('Draft could not be saved in this browser.');
    }
  }

  addPage(): void {
    this.flushActivePage();
    this.pageSequence += 1;
    const page: WriterPage = {
      id: `page-${Date.now()}-${this.pageSequence}`,
      title: `Page ${this.pages().length + 1}`,
      body: '',
      updatedAt: Date.now(),
    };
    this.pages.update((pages) => [...pages, page]);
    this.openPage(page);
    this.savedAt.set(null);
  }

  selectPage(id: string): void {
    if (id === this.activePageId()) return;
    const page = this.pages().find((candidate) => candidate.id === id);
    if (!page) return;
    this.flushActivePage();
    this.openPage(page);
  }

  updatePageTitle(value: string): void {
    this.trackTitle.set(value);
    this.flushActivePage();
    this.savedAt.set(null);
    this.saveError.set('');
  }

  updatePageBody(value: string): void {
    this.lyrics.set(value);
    this.flushActivePage();
    this.savedAt.set(null);
    this.saveError.set('');
  }

  wordCountOf(body: string): number {
    return this.countWords(body);
  }

  pageLabel(page: WriterPage): string {
    return page.title.trim() || 'Untitled Page';
  }

  private openPage(page: WriterPage): void {
    this.activePageId.set(page.id);
    this.trackTitle.set(page.title);
    this.lyrics.set(page.body);
    this.saveError.set('');
  }

  /** Fold the live title/body buffers back into the page list. */
  private flushActivePage(updatedAt = Date.now()): void {
    const activeId = this.activePageId();
    const title = this.trackTitle().trim() || 'Untitled Page';
    this.pages.update((pages) =>
      pages.map((page) =>
        page.id === activeId
          ? { ...page, title, body: this.lyrics(), updatedAt }
          : page
      )
    );
  }

  private restoreWriterState(): void {
    if (this.restorePages()) return;
    this.restoreLegacyDraft();
  }

  private restorePages(): boolean {
    try {
      const raw = localStorage.getItem(WRITER_PAGES_KEY);
      if (!raw) return false;
      const stored = JSON.parse(raw) as StoredWriterPages;
      if (!Array.isArray(stored.pages) || !stored.pages.length) return false;

      const pages = stored.pages
        .map((value, index) => this.asPage(value, index))
        .filter((page): page is WriterPage => page !== null);
      if (!pages.length) return false;

      const requestedActive =
        typeof stored.activePageId === 'string' ? stored.activePageId : '';
      const active =
        pages.find((page) => page.id === requestedActive) ?? pages[0];

      this.pages.set(pages);
      this.pageSequence = pages.length;
      this.activePageId.set(active.id);
      this.trackTitle.set(active.title);
      this.lyrics.set(active.body);
      if (typeof stored.savedAt === 'number') this.savedAt.set(stored.savedAt);
      return true;
    } catch {
      return false;
    }
  }

  private restoreLegacyDraft(): void {
    try {
      const raw = localStorage.getItem(LYRIC_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        lyrics?: unknown;
        title?: unknown;
        savedAt?: unknown;
      };
      const body = typeof draft.lyrics === 'string' ? draft.lyrics : '';
      const title =
        typeof draft.title === 'string' && draft.title.trim()
          ? draft.title
          : 'Untitled Page';
      const updatedAt =
        typeof draft.savedAt === 'number' ? draft.savedAt : Date.now();

      this.pages.set([{ id: 'page-1', title, body, updatedAt }]);
      this.activePageId.set('page-1');
      this.trackTitle.set(title);
      this.lyrics.set(body);
      if (typeof draft.savedAt === 'number') this.savedAt.set(draft.savedAt);
    } catch {
      // A blocked or corrupt draft store just means starting empty.
    }
  }

  private asPage(value: unknown, index: number): WriterPage | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const body = typeof candidate.body === 'string' ? candidate.body : '';
    const title =
      typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title
        : `Page ${index + 1}`;
    const id =
      typeof candidate.id === 'string' && candidate.id
        ? candidate.id
        : `page-${index + 1}`;
    const updatedAt =
      typeof candidate.updatedAt === 'number'
        ? candidate.updatedAt
        : Date.now();
    return { id, title, body, updatedAt };
  }

  private countWords(value: string): number {
    const trimmed = value.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }
}
