import { Injectable, inject, signal } from "@angular/core";
import { LocalStorageService } from "../../services/local-storage.service";

/** Object store holding imported GLB performers (see LocalStorageService). */
export const CHARACTER_LIBRARY_STORE = "character_models";

/**
 * One saved performer, kept as flat metadata so the library can be listed
 * without reading a single model's bytes back into memory.
 */
export interface SavedCharacterModel {
  id: string;
  /** Display name: the file name without its extension. */
  name: string;
  /** Original file name, so a loaded model keeps its identity. */
  fileName: string;
  size: number;
  clips: number;
  addedAt: number;
}

/**
 * A handful of performers is plenty for a set, and IndexedDB is best-effort
 * storage that a browser may cap at a few hundred megabytes. Oldest models are
 * dropped rather than letting one export habit fill the artist's origin quota.
 */
export const MAX_SAVED_CHARACTERS = 8;

const LIBRARY_INDEX_KEY = "character-library:index";
const CHARACTER_RECORD_PREFIX = "character:";

interface CharacterLibraryIndex {
  id: string;
  models: SavedCharacterModel[];
}

interface StoredCharacter {
  id: string;
  name: string;
  clips: number;
  addedAt: number;
  blob: Blob;
}

/**
 * The saved performer library behind the Visual Stage.
 *
 * Records are split on purpose: the model blobs are keyed by id, and a single
 * index record holds the metadata. Listing the library therefore reads a few
 * hundred bytes instead of dragging every stored model into memory, and the
 * GLB is only fetched when the artist actually puts it on stage.
 *
 * A browser that cannot persist (private mode, blocked upgrade) must not stop
 * the stage working, so every method reports failure by returning null rather
 * than throwing; the caller decides what to tell the artist.
 */
@Injectable({
  providedIn: "root",
})
export class CharacterLibraryService {
  private readonly storage = inject(LocalStorageService);

  readonly models = signal<SavedCharacterModel[]>([]);
  /** False when this browser is not currently able to persist the library. */
  readonly available = signal(true);

  async refresh(): Promise<SavedCharacterModel[]> {
    const models = await this.readIndex();
    this.available.set((await this.storage.persistenceStatus()) === "ready");
    this.models.set(models);
    return models;
  }

  /**
   * Persist an imported performer. Re-importing the same file replaces the
   * existing entry instead of filling the library with duplicates.
   */
  async save(file: File, clips: number): Promise<SavedCharacterModel | null> {
    if (!file.name || file.size === 0) return null;
    try {
      if ((await this.storage.persistenceStatus()) !== "ready") {
        this.available.set(false);
        return null;
      }

      const existing = await this.readIndex();
      const duplicate = existing.find(
        (model) => model.fileName === file.name && model.size === file.size,
      );
      const model: SavedCharacterModel = {
        id:
          duplicate?.id ??
          `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name.replace(/\.glb$/i, ""),
        fileName: file.name,
        size: file.size,
        clips,
        addedAt: Date.now(),
      };

      const combined = [
        model,
        ...existing.filter((entry) => entry.id !== model.id),
      ];
      const kept = combined.slice(0, MAX_SAVED_CHARACTERS);
      const dropped = combined.slice(MAX_SAVED_CHARACTERS);

      const record: StoredCharacter = {
        id: `${CHARACTER_RECORD_PREFIX}${model.id}`,
        name: file.name,
        clips,
        addedAt: model.addedAt,
        blob: file,
      };
      await this.storage.saveItem(CHARACTER_LIBRARY_STORE, record);

      const index: CharacterLibraryIndex = {
        id: LIBRARY_INDEX_KEY,
        models: kept,
      };
      await this.storage.saveItem(CHARACTER_LIBRARY_STORE, index);

      if (dropped.length > 0) {
        await this.deleteRecords(dropped);
      }

      this.available.set(true);
      this.models.set(kept);
      return model;
    } catch {
      return null;
    }
  }

  /** Read one saved performer back as a file the GLB loader can parse. */
  async load(id: string): Promise<File | null> {
    try {
      const record = (await this.storage.getItem(
        CHARACTER_LIBRARY_STORE,
        `${CHARACTER_RECORD_PREFIX}${id}`,
      )) as StoredCharacter | null;
      if (!record?.blob) return null;
      return new File([record.blob], record.name || `${id}.glb`, {
        type: "model/gltf-binary",
      });
    } catch {
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.readIndex();
    const kept = existing.filter((model) => model.id !== id);
    if (kept.length === existing.length) return;
    try {
      const index: CharacterLibraryIndex = {
        id: LIBRARY_INDEX_KEY,
        models: kept,
      };
      await this.storage.saveItem(CHARACTER_LIBRARY_STORE, index);
      await this.deleteRecords([{ id } as SavedCharacterModel]);
      this.models.set(kept);
    } catch {
      /* A failed delete leaves the entry listed and still usable. */
    }
  }

  private async deleteRecords(models: SavedCharacterModel[]): Promise<void> {
    try {
      await this.storage.deleteItems(
        CHARACTER_LIBRARY_STORE,
        models.map((model) => `${CHARACTER_RECORD_PREFIX}${model.id}`),
      );
    } catch {
      /* Orphaned blobs are unreadable, so a failed prune is only wasted space. */
    }
  }

  private async readIndex(): Promise<SavedCharacterModel[]> {
    try {
      const index = (await this.storage.getItem(
        CHARACTER_LIBRARY_STORE,
        LIBRARY_INDEX_KEY,
      )) as CharacterLibraryIndex | null;
      const models = Array.isArray(index?.models) ? index.models : [];
      return models
        .filter((model) => typeof model?.id === "string")
        .sort((a, b) => b.addedAt - a.addedAt);
    } catch {
      return [];
    }
  }
}
