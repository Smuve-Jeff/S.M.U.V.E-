import { formatMemoryBytes, readHeapMemory } from "./memory-estimate.util";

describe("readHeapMemory", () => {
  it("reads the Chromium heap counters", () => {
    expect(
      readHeapMemory({
        memory: {
          usedJSHeapSize: 120 * 1024 * 1024,
          totalJSHeapSize: 180 * 1024 * 1024,
          jsHeapSizeLimit: 4 * 1024 * 1024 * 1024,
        },
      }),
    ).toEqual({
      usedBytes: 120 * 1024 * 1024,
      totalBytes: 180 * 1024 * 1024,
      limitBytes: 4 * 1024 * 1024 * 1024,
    });
  });

  it("returns null when the host does not expose the heap API", () => {
    expect(readHeapMemory({})).toBeNull();
    expect(readHeapMemory(null)).toBeNull();
  });

  it("rejects incomplete or non-finite heap counters", () => {
    expect(
      readHeapMemory({
        memory: {
          usedJSHeapSize: 1,
          totalJSHeapSize: 2,
        },
      }),
    ).toBeNull();
    expect(
      readHeapMemory({
        memory: {
          usedJSHeapSize: Number.NaN,
          totalJSHeapSize: 2,
          jsHeapSizeLimit: 3,
        },
      }),
    ).toBeNull();
    expect(
      readHeapMemory({
        memory: {
          usedJSHeapSize: 1,
          totalJSHeapSize: 2,
          jsHeapSizeLimit: 0,
        },
      }),
    ).toBeNull();
  });
});

describe("formatMemoryBytes", () => {
  it("formats bytes at the scale an artist reads", () => {
    expect(formatMemoryBytes(0)).toBe("0 MB");
    expect(formatMemoryBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
    expect(formatMemoryBytes(120 * 1024 * 1024)).toBe("120 MB");
    expect(formatMemoryBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
    expect(formatMemoryBytes(12 * 1024 * 1024 * 1024)).toBe("12 GB");
  });

  it("does not invent a number when the metric is unavailable", () => {
    expect(formatMemoryBytes(null)).toBe("—");
    expect(formatMemoryBytes(undefined)).toBe("—");
    expect(formatMemoryBytes(-1)).toBe("—");
    expect(formatMemoryBytes(Number.NaN)).toBe("—");
  });
});
