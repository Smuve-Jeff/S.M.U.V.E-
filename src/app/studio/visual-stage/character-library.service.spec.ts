import { TestBed } from "@angular/core/testing";
import { LocalStorageService } from "../../services/local-storage.service";
import {
  CHARACTER_LIBRARY_STORE,
  CharacterLibraryService,
  MAX_SAVED_CHARACTERS,
  type SavedCharacterModel,
} from "./character-library.service";

const LIBRARY_INDEX_KEY = "character-library:index";

const createStorage = (overrides: Record<string, unknown> = {}) => ({
  persistenceStatus: jest.fn().mockResolvedValue("ready"),
  saveItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
  deleteItems: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const glbFile = (name = "Nova.glb") =>
  new File([new Uint8Array([1, 2, 3])], name, {
    type: "model/gltf-binary",
  });

const savedModel = (
  id: string,
  addedAt: number,
  name = `Model ${id}`,
): SavedCharacterModel => ({
  id,
  name,
  fileName: `${name}.glb`,
  size: 3,
  clips: 1,
  addedAt,
});

describe("CharacterLibraryService", () => {
  let storage: ReturnType<typeof createStorage>;
  let service: CharacterLibraryService;

  beforeEach(() => {
    storage = createStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: LocalStorageService, useValue: storage }],
    });
    service = TestBed.inject(CharacterLibraryService);
  });

  it("stores the GLB blob apart from the metadata index", async () => {
    const file = glbFile();

    const model = await service.save(file, 3);

    expect(model).not.toBeNull();
    expect(model?.name).toBe("Nova");
    expect(model?.clips).toBe(3);
    expect(storage.saveItem).toHaveBeenNthCalledWith(
      1,
      CHARACTER_LIBRARY_STORE,
      expect.objectContaining({
        id: `character:${model?.id}`,
        name: "Nova.glb",
        blob: file,
      }),
    );
    expect(storage.saveItem).toHaveBeenNthCalledWith(
      2,
      CHARACTER_LIBRARY_STORE,
      expect.objectContaining({
        id: LIBRARY_INDEX_KEY,
        models: [
          expect.objectContaining({ name: "Nova", fileName: "Nova.glb" }),
        ],
      }),
    );
    expect(service.models().map((entry) => entry.name)).toEqual(["Nova"]);
  });

  it("replaces an existing entry instead of duplicating the same file", async () => {
    const existing = savedModel("abc", 1, "Nova");
    storage.getItem.mockResolvedValue({
      id: LIBRARY_INDEX_KEY,
      models: [existing],
    });

    const model = await service.save(glbFile(), 2);

    expect(model?.id).toBe("abc");
    expect(model?.clips).toBe(2);
    const index = storage.saveItem.mock.calls[1][1] as {
      models: SavedCharacterModel[];
    };
    expect(index.models).toHaveLength(1);
    expect(index.models[0]).toEqual(
      expect.objectContaining({ id: "abc", fileName: "Nova.glb", clips: 2 }),
    );
  });

  it("reads a saved performer back as a GLB file", async () => {
    storage.getItem.mockResolvedValue({
      id: "character:abc",
      name: "Nova.glb",
      blob: new Blob([new Uint8Array([1])], { type: "model/gltf-binary" }),
    });

    const file = await service.load("abc");

    expect(file?.name).toBe("Nova.glb");
    expect(file?.type).toBe("model/gltf-binary");
    expect(file?.size).toBe(1);
    expect(storage.getItem).toHaveBeenCalledWith(
      CHARACTER_LIBRARY_STORE,
      "character:abc",
    );
  });

  it("returns null when the stored model is missing", async () => {
    await expect(service.load("missing")).resolves.toBeNull();
  });

  it("removes one performer and its blob without touching the others", async () => {
    storage.getItem.mockResolvedValue({
      id: LIBRARY_INDEX_KEY,
      models: [savedModel("abc", 2), savedModel("def", 1)],
    });

    await service.remove("abc");

    expect(storage.deleteItems).toHaveBeenCalledWith(CHARACTER_LIBRARY_STORE, [
      "character:abc",
    ]);
    expect(service.models().map((model) => model.id)).toEqual(["def"]);
  });

  it("prunes the oldest performer once the library is full", async () => {
    const full = Array.from({ length: MAX_SAVED_CHARACTERS }, (_, index) =>
      savedModel(`old-${index}`, 100 - index),
    );
    storage.getItem.mockResolvedValue({
      id: LIBRARY_INDEX_KEY,
      models: full,
    });

    const model = await service.save(glbFile("Fresh.glb"), 0);

    const index = storage.saveItem.mock.calls[1][1] as {
      models: SavedCharacterModel[];
    };
    expect(index.models).toHaveLength(MAX_SAVED_CHARACTERS);
    expect(index.models[0].id).toBe(model?.id);
    expect(storage.deleteItems).toHaveBeenCalledWith(CHARACTER_LIBRARY_STORE, [
      `character:${full[MAX_SAVED_CHARACTERS - 1].id}`,
    ]);
  });

  it("reports a browser that cannot persist and does not pretend to save", async () => {
    storage.persistenceStatus.mockResolvedValue("blocked");

    const model = await service.save(glbFile(), 1);
    await service.refresh();

    expect(model).toBeNull();
    expect(storage.saveItem).not.toHaveBeenCalled();
    expect(service.available()).toBe(false);
  });
});
