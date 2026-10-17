import { DB_NAME, DATABASE_URL, JWT_SECRET, NODE_ENV, PORT } from "./env";

// Values come from setup-jest-server.ts, which runs before this module loads.
describe("env config (server)", () => {
  it("reads NODE_ENV from the test harness", () => {
    expect(NODE_ENV).toBe("test");
  });

  it("reads DATABASE_URL and derives the database name", () => {
    expect(DATABASE_URL).toContain("postgres");
    expect(DB_NAME).toBe("testdb");
  });

  it("exposes a stable JWT secret under test", () => {
    expect(JWT_SECRET).toBe("test-jwt-secret");
  });

  it("exposes a numeric PORT", () => {
    expect(Number.isFinite(PORT)).toBe(true);
    expect(PORT).toBeGreaterThan(0);
  });
});