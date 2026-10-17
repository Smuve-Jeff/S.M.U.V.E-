import jwt from "jsonwebtoken";
import { AppError } from "@/lib";
import { authenticate, requireRole } from "./auth";

/**
 * The middleware consults the account on every request (session revocation),
 * so the data source is stubbed with a single controllable lookup. `mockFindOne`
 * is prefixed `mock` because jest hoists this factory above the imports.
 */
const mockFindOne = jest.fn();
jest.mock("@/database/data-source", () => ({
  AppDataSource: {
    getRepository: jest.fn(() => ({ findOne: mockFindOne })),
  },
}));

describe("authenticate", () => {
  const makeReq = (headers: Record<string, string | undefined> = {}) =>
    ({ headers }) as never;

  const makeRes = () =>
    ({ status: jest.fn().mockReturnThis(), json: jest.fn() }) as never;

  const sign = (
    payload: Record<string, unknown>,
    options: jwt.SignOptions = {},
  ) => jwt.sign(payload, process.env.JWT_SECRET!, options);

  beforeEach(() => {
    mockFindOne.mockReset();
    mockFindOne.mockResolvedValue({ id: 7, role: "admin", tokenVersion: 0 });
  });

  it("rejects a missing token", async () => {
    const next = jest.fn();
    await authenticate(makeReq(), makeRes(), next);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
  });

  it("rejects a malformed token", async () => {
    const next = jest.fn();
    await authenticate(
      makeReq({ authorization: "Bearer garbage.token.here" }),
      makeRes(),
      next,
    );
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
  });

  it("accepts a valid token and populates req.user from the account", async () => {
    const token = sign({ userId: 7, role: "admin", tv: 0 });
    const req = { headers: { authorization: `Bearer ${token}` } } as never;
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect((req as { user?: unknown }).user).toEqual({
      userId: 7,
      role: "admin",
    });
  });

  it("takes the role from the account, not the token", async () => {
    // A demoted admin must lose admin scope immediately instead of keeping it
    // until the token expires.
    mockFindOne.mockResolvedValue({ id: 7, role: "user", tokenVersion: 0 });
    const token = sign({ userId: 7, role: "admin", tv: 0 });
    const req = { headers: { authorization: `Bearer ${token}` } } as never;
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect((req as { user?: { role?: string } }).user?.role).toBe("user");
  });

  it("rejects a token issued before a credential rotation", async () => {
    mockFindOne.mockResolvedValue({ id: 7, role: "admin", tokenVersion: 1 });
    const token = sign({ userId: 7, role: "admin", tv: 0 });
    const next = jest.fn();
    await authenticate(
      makeReq({ authorization: `Bearer ${token}` }),
      makeRes(),
      next,
    );
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/revoked/i);
  });

  it("treats a legacy token without `tv` as version 0", async () => {
    // Tokens minted before revocation existed must keep working for accounts
    // that were never rotated — otherwise shipping this signs everyone out.
    const token = sign({ userId: 7, role: "admin" });
    const req = { headers: { authorization: `Bearer ${token}` } } as never;
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it("refuses a token whose algorithm was not pinned at signing", async () => {
    const token = sign({ userId: 7, role: "admin", tv: 0 }, { algorithm: "HS512" });
    const next = jest.fn();
    await authenticate(
      makeReq({ authorization: `Bearer ${token}` }),
      makeRes(),
      next,
    );
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
  });

  it("rejects a token for an account that no longer exists", async () => {
    mockFindOne.mockResolvedValue(null);
    const token = sign({ userId: 7, role: "admin", tv: 0 });
    const next = jest.fn();
    await authenticate(
      makeReq({ authorization: `Bearer ${token}` }),
      makeRes(),
      next,
    );
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
  });

  it("fails closed when the account lookup itself fails", async () => {
    mockFindOne.mockRejectedValue(new Error("connection terminated"));
    const token = sign({ userId: 7, role: "admin", tv: 0 });
    const next = jest.fn();
    await authenticate(
      makeReq({ authorization: `Bearer ${token}` }),
      makeRes(),
      next,
    );
    // The raw error is forwarded to the central handler — never treated as a
    // successful authentication.
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
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
    requireRole("admin")(
      { user: { userId: 1, role: "user" } } as never,
      makeRes(),
      next,
    );
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
