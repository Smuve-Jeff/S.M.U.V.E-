import { Injectable, signal } from '@angular/core';

/** The two halves of the Songwriting Studio a draft can travel between. */
export type SongwritingSurface = 'pad' | 'cowrite';

export interface SongwritingHandoff {
  title: string;
  body: string;
  from: SongwritingSurface;
  to: SongwritingSurface;
}

/**
 * Carries a draft from one Songwriting Studio room to the other.
 *
 * The Writer's Pad and the Co-Write room share a workspace but not a store: the
 * pad keeps pages in this browser, while a co-write keeps its turns in
 * `CoWriteService`. This holds the one draft being moved between them, so
 * neither surface has to reach into the other's storage.
 *
 * A handoff is claimed exactly once. An empty body is refused, because moving
 * a blank page between rooms would silently replace real work with nothing.
 */
@Injectable({
  providedIn: 'root',
})
export class SongwritingHandoffService {
  private readonly pendingDraft = signal<SongwritingHandoff | null>(null);

  /** The draft waiting for a surface, without consuming it. */
  pendingFor(target: SongwritingSurface): SongwritingHandoff | null {
    const draft = this.pendingDraft();
    return draft && draft.to === target ? draft : null;
  }

  handOff(draft: SongwritingHandoff): void {
    // Pages are often written with leading blank lines; trim the edges so the
    // receiving room does not open on an empty first turn.
    const body = (draft.body ?? '').trim();
    if (!body) return;
    this.pendingDraft.set({ ...draft, body });
  }

  /** Reads the draft addressed to this surface and clears it. */
  claim(target: SongwritingSurface): SongwritingHandoff | null {
    const draft = this.pendingFor(target);
    if (!draft) return null;
    this.pendingDraft.set(null);
    return draft;
  }

  clear(): void {
    this.pendingDraft.set(null);
  }
}
