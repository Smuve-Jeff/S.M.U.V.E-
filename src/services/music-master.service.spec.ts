import type { Request } from "express";
import {
  listPublishedMasters,
  masterId,
  mergeMasterEntry,
  normalizeMasterEntry,
  publishMaster,
  removeMasterEntry,
  unpublishMaster,
  type PublishedMaster,
} from "./music-master.service";

/** A stored entry, so the pure helpers can be exercised without storage. */
const entry = (overrides: Partial<PublishedMaster> = {}): PublishedMaster => ({
  id: "id:1",
  trackId: 1,
  title: "Official Record",
  album: "Official Album",
  url: "https://cdn.test/one.wav",
  publishedAt: "2026-09-19T00:00:00.000Z",
  ...overrides,
});

const request = (userId = 7): Request =>
  ({ user: { userId, role: "Artist" } }) as unknown as Request;

const audioFile = (): Express.Multer.File =>
  ({
    originalname: "master.wav",
    mimetype: "audio/wav",
    buffer: Buffer.from("audio"),
  }) as Express.Multer.File;

describe("music master hosting", () => {
  describe("identity", () => {
    it('keys a record by its track id when it has one, and by title otherwise', () => {
      expect(masterId({ trackId: 1691028383, title: "Killuminati" })).toBe(
        "id:1691028383",
      );
      expect(masterId({ trackId: null, title: "Killuminati" })).toBe(
        "title:killuminati",
      );
    });

    it("folds the title the way the radio's own matching does", () => {
      // Case, punctuation, brackets and feature credits all fold away; two
      // devices publishing the same record must produce one entry, not two.
      expect(masterId({ title: "Lost My Mind (feat. ChrisO)" })).toBe(
        "title:lost my mind",
      );
      expect(masterId({ title: "LOST  my mind!" })).toBe("title:lost my mind");
      expect(masterId({ title: "Stand On That (feat. PBA) (Mixtape)" })).toBe(
        "title:stand on that mixtape",
      );
    });

    it("treats a non-numeric track id as no track id at all", () => {
      // Storing `NaN` would be the worst outcome: it matches nothing on the
      // client and cannot be compared for equality either.
      expect(masterId({ trackId: Number.NaN, title: "Record" })).toBe(
        "title:record",
      );
      expect(masterId({ trackId: undefined, title: "Record" })).toBe(
        "title:record",
      );
    });
  });

  describe("validation", () => {
    it("accepts a titled recording and carries its id", () => {
      const normalized = normalizeMasterEntry(
        { trackId: "42", title: "  The Wall  ", album: " The Black Label " },
        "https://cdn.test/wall.wav",
        "2026-09-19T00:00:00.000Z",
      );

      expect(normalized).toEqual({
        id: "id:42",
        trackId: 42,
        title: "The Wall",
        album: "The Black Label",
        url: "https://cdn.test/wall.wav",
        publishedAt: "2026-09-19T00:00:00.000Z",
      });
    });

    it("refuses a master with no title or no audio", () => {
      expect(
        normalizeMasterEntry({ title: "   " }, "https://cdn.test/a.wav", "now"),
      ).toBeNull();
      expect(
        normalizeMasterEntry({ title: "Record" }, "", "now"),
      ).toBeNull();
      expect(normalizeMasterEntry({}, "https://cdn.test/a.wav", "now")).toBeNull();
    });

    it("stores no album rather than an empty string", () => {
      expect(
        normalizeMasterEntry(
          { title: "Record", album: "   " },
          "https://cdn.test/a.wav",
          "now",
        )?.album,
      ).toBeNull();
    });

    it("drops a track id that is not a positive number", () => {
      expect(
        normalizeMasterEntry(
          { trackId: "not-a-number", title: "Record" },
          "https://cdn.test/a.wav",
          "now",
        )?.trackId,
      ).toBeNull();
      expect(
        normalizeMasterEntry(
          { trackId: -3, title: "Record" },
          "https://cdn.test/a.wav",
          "now",
        )?.trackId,
      ).toBeNull();
    });
  });

  describe("the list", () => {
    it("replaces an entry instead of listing the record twice", () => {
      const first = entry();
      const better = entry({ url: "https://cdn.test/better.wav" });

      const merged = mergeMasterEntry([first, entry({ id: "id:2", trackId: 2 })], better);

      expect(merged).toHaveLength(2);
      expect(merged.find((item) => item.id === "id:1")?.url).toBe(
        "https://cdn.test/better.wav",
      );
    });

    it("keeps the order, so the list still reads oldest first", () => {
      const merged = mergeMasterEntry(
        [entry({ id: "id:1", trackId: 1 }), entry({ id: "id:2", trackId: 2 })],
        entry({ id: "id:3", trackId: 3 }),
      );

      expect(merged.map((item) => item.id)).toEqual(["id:1", "id:2", "id:3"]);
    });

    it("removes one entry and treats an absent one as already gone", () => {
      const masters = [entry({ id: "id:1" }), entry({ id: "id:2" })];

      expect(removeMasterEntry(masters, "id:1").map((item) => item.id)).toEqual([
        "id:2",
      ]);
      expect(removeMasterEntry(masters, "id:9")).toHaveLength(2);
    });
  });

  describe("without storage configured", () => {
    it("lists nothing rather than throwing", async () => {
      await expect(listPublishedMasters()).resolves.toEqual([]);
    });

    it("refuses to publish, and says exactly which keys are missing", async () => {
      await expect(
        publishMaster(request(), audioFile(), {
          title: "Record",
          trackId: "1",
        }),
      ).rejects.toMatchObject({
        statusCode: 503,
        message: expect.stringContaining("R2_ENDPOINT"),
      });
    });

    it("refuses to remove, rather than reporting a removal that did not happen", async () => {
      await expect(unpublishMaster("id:1")).rejects.toMatchObject({
        statusCode: 503,
      });
    });
  });
});
