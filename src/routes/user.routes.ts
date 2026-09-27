import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AppError, parseIdParam } from "@/lib";
import { authenticate, requireRole } from "@/middleware/auth";
import { disconnectUserSockets } from "@/socket";
import {
  deleteUser,
  getUserById,
  issueAuthToken,
  listUsers,
  revokePasswordResetTokens,
  updateUser,
  verifyUserPassword,
} from "@/services";
import { userSchemas, validateBody } from "@/validators";

const router = Router();

/**
 * Password rotation is a sensitive write guarded by a credential check, so the
 * check itself needs a budget: keyed per account (not per IP) because the
 * attacker already holds a session. Successful writes are not counted.
 */
const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `password-change:${req.user?.userId ?? "unknown"}`,
  message: { error: "Too many password change attempts. Try again in 15 minutes." },
});

// All user routes require authentication.
router.use(authenticate);

// GET /api/user — list all users (admins only)
router.get("/", requireRole("admin"), async (_req, res) => {
  res.json(await listUsers());
});

// GET /api/user/me — current user's profile
router.get("/me", async (req, res) => {
  if (!req.user) throw new AppError(401, "Authentication required");
  res.json(await getUserById(req.user.userId));
});

// GET /api/user/:id — own profile, or anyone's profile for admins
router.get("/:id", async (req, res) => {
  const id = parseIdParam(req.params.id);
  const me = req.user;
  if (!me) throw new AppError(401, "Authentication required");

  const user = await getUserById(id);
  if (me.role !== "admin" && user.id !== me.userId) {
    throw new AppError(403, "You do not have permission to view this user");
  }
  res.json(user);
});

// PUT /api/user/:id — update own profile (admins may update anyone / roles)
router.put(
  "/:id",
  passwordChangeLimiter,
  validateBody(userSchemas.update),
  async (req, res) => {
    const id = parseIdParam(req.params.id);
    const me = req.user;
    if (!me) throw new AppError(401, "Authentication required");

    if (me.role !== "admin" && id !== me.userId) {
      throw new AppError(403, "You can only update your own profile");
    }
    if (req.body.role !== undefined && me.role !== "admin") {
      throw new AppError(403, "Only admins can change roles");
    }

    const { currentPassword, ...patch } = req.body;

    // Re-authenticate before a self-service password change. Admins resetting
    // someone else's password are exempt: they never knew it to begin with.
    if (patch.password !== undefined && id === me.userId) {
      const proven =
        typeof currentPassword === "string" &&
        currentPassword.length > 0 &&
        (await verifyUserPassword(id, currentPassword));
      if (!proven) {
        throw new AppError(
          403,
          "Your current password is required to set a new password",
        );
      }
    }

    const updated = await updateUser(id, patch);

    if (patch.password !== undefined) {
      // Rotating the credential retires every outstanding recovery link, so a
      // reset email sent before the change cannot be replayed against the new
      // password.
      await revokePasswordResetTokens(id);
      disconnectUserSockets(id);
    }

    // Revoking every session also kills the caller's own token, so the owner
    // changing their own password gets a replacement instead of being logged
    // out of the device they just used. Admins resetting someone else's
    // credential never receive a token for that account.
    const replacementToken = patch.password !== undefined && id === me.userId
      ? await issueAuthToken(id)
      : null;

    res.json(replacementToken ? { ...updated, token: replacementToken } : updated);
  },
);

// DELETE /api/user/:id — delete own profile (admins may delete anyone)
router.delete("/:id", async (req, res) => {
  const id = parseIdParam(req.params.id);
  const me = req.user;
  if (!me) throw new AppError(401, "Authentication required");

  if (me.role !== "admin" && id !== me.userId) {
    throw new AppError(403, "You can only delete your own profile");
  }

  await deleteUser(id);
  res.status(204).end();
});

export default router;
