import { AppError, errorHandler, notFoundHandler, parseIdParam } from "./index";

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
