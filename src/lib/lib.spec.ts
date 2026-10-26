import {
  AppError,
  assertProfileBelongsTo,
  errorHandler,
  notFoundHandler,
  parseIdParam,
  stampProfileOwner,
} from "./index";

describe("stampProfileOwner", () => {
  it("re-stamps a blob that disagrees with its row", () => {
    expect(stampProfileOwner({ id: "u2", artistName: "Nova" }, "u1")).toEqual({
      id: "u1",
      artistName: "Nova",
    });
  });

  it("produces a blob the write guard accepts", () => {
    const repaired = stampProfileOwner({ id: "u2", artistName: "Nova" }, "u1");
    expect(() => assertProfileBelongsTo(repaired, "u1")).not.toThrow();
  });

  it("returns matching, unstamped and non-object values unchanged", () => {
    const matching = { id: "u1", artistName: "Nova" };
    expect(stampProfileOwner(matching, "u1")).toBe(matching);
    const unstamped = { artistName: "Nova" };
    expect(stampProfileOwner(unstamped, "u1")).toBe(unstamped);
    expect(stampProfileOwner(null, "u1")).toBeNull();
    expect(stampProfileOwner(["a"], "u1")).toEqual(["a"]);
    expect(stampProfileOwner({ id: 7 }, "u1")).toEqual({ id: 7 });
  });
});

describe("assertProfileBelongsTo", () => {
  it("accepts a blob stamped as its owner", () => {
    expect(() => assertProfileBelongsTo({ id: "u1" }, "u1")).not.toThrow();
  });

  it("rejects a blob stamped as another account", () => {
    expect(() => assertProfileBelongsTo({ id: "u2" }, "u1")).toThrow(AppError);
    try {
      assertProfileBelongsTo({ id: "u2" }, "u1");
    } catch (error) {
      expect((error as AppError).statusCode).toBe(400);
    }
  });

  it("accepts an unstamped blob and ignores non-string stamps", () => {
    expect(() => assertProfileBelongsTo({ artistName: "New" }, "u1")).not.toThrow();
    expect(() => assertProfileBelongsTo({ id: 42 }, "u1")).not.toThrow();
    expect(() => assertProfileBelongsTo(null, "u1")).not.toThrow();
    expect(() => assertProfileBelongsTo({ id: "   " }, "u1")).not.toThrow();
  });
});

describe("AppError", () => {
  it("carries a status code and message", () => {
    const err = new AppError(404, "Not found", { field: "id" });
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.details).toEqual({ field: "id" });
  });
});

describe("parseIdParam", () => {
  it("parses positive integers", () => {
    expect(parseIdParam("42")).toBe(42);
  });

  it("throws 400 for non-integers", () => {
    expect(() => parseIdParam("abc")).toThrow(AppError);
    expect(() => parseIdParam("0")).toThrow("Invalid id");
    expect(() => parseIdParam("-3")).toThrow("Invalid id");
    expect(() => parseIdParam("1.5")).toThrow("Invalid id");
  });
});

describe("notFoundHandler", () => {
  it("forwards a 404 AppError", () => {
    const next = jest.fn();
    notFoundHandler({ method: "GET", originalUrl: "/nope" } as never, {} as never, next);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("/nope");
  });
});

describe("errorHandler", () => {
  const makeRes = () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    return res as unknown as {
      status: jest.Mock;
      json: jest.Mock;
    };
  };

  it("serializes AppError with status + error message", () => {
    const res = makeRes();
    errorHandler(new AppError(403, "Forbidden"), {} as never, res as never, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
  });

  it("includes details when present", () => {
    const res = makeRes();
    errorHandler(
      new AppError(400, "Invalid body", [{ path: "name", message: "too short" }]),
      {} as never,
      res as never,
      jest.fn(),
    );
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid body",
      details: [{ path: "name", message: "too short" }],
    });
  });

  it("returns 500 for unknown errors", () => {
    const res = makeRes();
    errorHandler(new Error("boom"), {} as never, res as never, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });
});
