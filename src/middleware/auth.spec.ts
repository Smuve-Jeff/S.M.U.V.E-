import jwt from "jsonwebtoken";
import { AppError } from "@/lib";
import { authenticate, requireRole } from "./auth";

describe("authenticate", () => {
  const makeReq = (headers: Record<string, string | undefined> = {}) =>
    ({ headers }) as never;

  const makeRes = () =>
    ({ status: jest.fn().mockReturnThis(), json: jest.fn() }) as never;

  it("rejects a missing token", () => {
    const next = jest.fn();
    authenticate(makeReq(), makeRes(), next);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
  });

  it("rejects a malformed token", () => {
    const next = jest.fn();
    authenticate(makeReq({ authorization: "Bearer garbage.token.here" }), makeRes(), next);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
  });

  it("accepts a valid token and populates req.user", () => {
    const token = jwt.sign({ userId: 7, role: "admin" }, process.env.JWT_SECRET!);
    const req = { headers: { authorization: `Bearer ${token}` } } as never;
    const next = jest.fn();
    authenticate(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect((req as { user?: unknown }).user).toEqual({ userId: 7, role: "admin" });
  });
});

describe("requireRole", () => {
  const makeRes = () =>
    ({ status: jest.fn().mockReturnThis(), json: jest.fn() }) as never;

  it("rejects unauthenticated requests", () => {
    const next = jest.fn();
    requireRole("admin")({ user: undefined } as never, makeRes(), next);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
  });

  it("rejects insufficient role", () => {
    const next = jest.fn();
    requireRole("admin")({ user: { userId: 1, role: "user" } } as never, makeRes(), next);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
  });

  it("allows matching role", () => {
    const next = jest.fn();
    requireRole("admin")(
      { user: { userId: 1, role: "admin" } } as never,
      makeRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });
});
