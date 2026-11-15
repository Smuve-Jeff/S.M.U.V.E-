import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { validateSamplePackManifest } from "./sample-pack.types";

/** Factory seed content ships as assets; this spec keeps it installable. */
const PACKS_DIR = join(__dirname, "../../assets/sample-packs");

function packDirs(): string[] {
  if (!existsSync(PACKS_DIR)) return [];
  return readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("factory sample packs", () => {
  it("ships at least one factory pack", () => {
    expect(packDirs().length).toBeGreaterThan(0);
  });

  for (const id of packDirs()) {
    it(`${id}: manifest validates and every sample exists as a small WAV`, () => {
      const dir = join(PACKS_DIR, id);
      const manifestPath = join(dir, `${id}.smuvepack.json`);
      expect(existsSync(manifestPath)).toBe(true);

      const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
      const validated = validateSamplePackManifest(parsed);
      expect(validated.ok).toBe(true);
      if (validated.ok !== true) return;
      expect(validated.manifest.id).toBe(id);

      let total = 0;
      for (const sample of validated.manifest.samples) {
        const filePath = join(dir, sample.file);
        expect(existsSync(filePath)).toBe(true);
        const bytes = readFileSync(filePath);
        // RIFF....WAVE magic so sniffAudioKind accepts it.
        expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
        expect(bytes.length).toBeLessThanOrEqual(16 * 1024 * 1024);
        total += bytes.length;
      }
      expect(total).toBeLessThanOrEqual(64 * 1024 * 1024);
    });
  }
});
