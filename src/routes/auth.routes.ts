import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AppError } from "@/lib";
import { authenticate } from "@/middleware/auth";
import { disconnectUserSockets } from "@/socket";
import {
  confirmEmailVerification,
  getEmailConfigurationIssue,
  getUserById,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPasswordWithToken,
  sendEmailVerificationCode,
} from "@/services";
import { authSchemas, validateBody } from "@/validators";

const router = Router();

/**
 * Verification sends mail and confirms a short code, so it needs a budget of
 * its own — and one keyed per account, because the attacker here already holds
 * a session for that account. Mounted after `authenticate` so `req.user` is
 * populated (a global limiter would only ever see the IP).
 */
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `verify-email:${req.user?.userId ?? "unknown"}`,
  message: { error: "Too many verification attempts. Try again in 15 minutes." },
});

// POST /api/auth/register — create account, return JWT + user
router.post("/register", validateBody(authSchemas.register), async (req, res) => {
  const result = await registerUser(req.body);

  // Start address verification as part of onboarding. Best-effort by design: a
  // delivery problem must not fail the registration, because the artist can
  // request a fresh code from Settings and sign-in is never gated on it.
  try {
    await sendEmailVerificationCode(result.user.id);
  } catch (err) {
    console.error(
      `[auth] verification email not delivered (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  res.status(201).json(result);
});

// POST /api/auth/login — verify credentials, return JWT + user
router.post("/login", validateBody(authSchemas.login), async (req, res) => {
  const result = await loginUser(req.body);
  res.json(result);
});

/**
 * POST /api/auth/forgot-password — email a single-use reset link.
 *
 * The response is identical for a known address, an unknown address, and a
 * delivery failure: a 404/409 for unknown accounts (or an error body when
 * Plunk is down) would let anyone enumerate which emails have accounts here.
 * Operators get the reason in the server log instead.
 */
router.post(
  "/forgot-password",
  validateBody(authSchemas.forgotPassword),
  async (req, res) => {
    // Fail loudly when the mail pipeline itself is unconfigured. This decision
    // does not depend on the submitted address, so it cannot be used to probe
    // which emails have accounts — but it stops recovery from quietly
    // pretending a link was sent.
    const emailIssue = getEmailConfigurationIssue();
    if (emailIssue) {
      console.warn(`[auth] password reset unavailable — ${emailIssue}.`);
      throw new AppError(
        503,
        "Account recovery is temporarily unavailable. Try again later.",
      );
    }

    const { email } = req.body as { email: string };
    try {
      await requestPasswordReset(email);
    } catch (err) {
      console.error(
        `[auth] password reset not delivered (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    res.json({
      ok: true,
      message:
        "If an account exists for that address, a reset link is on its way.",
    });
  },
);

/**
 * POST /api/auth/reset-password — redeem a reset link.
 *
 * A failed redemption is a real answer about the token, not an access
 * failure, so the specific reason (invalid, expired, or already burned) is
 * returned as a 400.
 */
router.post(
  "/reset-password",
  validateBody(authSchemas.resetPassword),
  async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };
    const user = await resetPasswordWithToken(token, password);

    // The reset bumped the account's tokenVersion, so every HTTP session is
    // already dead; drop the live sockets too instead of leaving them
    // connected until they happen to reconnect.
    disconnectUserSockets(user.id);

    res.json({ ok: true, user });
  },
);

/**
 * POST /api/auth/verify-email/send — email a fresh 6-digit verification code.
 *
 * Authenticated: the code confirms an address the caller already has a session
 * for, and the send budget is keyed per account rather than per IP.
 */
router.post(
  "/verify-email/send",
  authenticate,
  verificationLimiter,
  async (req, res) => {
    if (!req.user) throw new AppError(401, "Authentication required");
    const result = await sendEmailVerificationCode(req.user.userId);
    if (!result.sent) {
      throw new AppError(503, result.message);
    }
    res.json({ ok: true, message: result.message });
  },
);

/**
 * POST /api/auth/verify-email/confirm — redeem a verification code.
 *
 * An incorrect code is a 400, an exhausted guessing budget is a 429: they need
 * different fixes (retype the code vs. request a new one).
 */
router.post(
  "/verify-email/confirm",
  authenticate,
  verificationLimiter,
  validateBody(authSchemas.verifyEmail),
  async (req, res) => {
    if (!req.user) throw new AppError(401, "Authentication required");
    const { code } = req.body as { code: string };
    const user = await confirmEmailVerification(req.user.userId, code);
    res.json({ ok: true, user });
  },
);

// GET /api/auth/me — current authenticated user
router.get("/me", authenticate, async (req, res) => {
  if (!req.user) throw new AppError(401, "Authentication required");
  res.json(await getUserById(req.user.userId));
});

// GET /api/auth/:platform — OAuth popup page. The frontend opens this in a
// popup window and listens for a `*_AUTH_SUCCESS` postMessage. A full OAuth
// flow would redirect to the provider here; for now we complete the popup
// contract so the stream/connect UI can proceed (simulated success).
router.get("/:platform", (req, res) => {
  const platform = (req.params.platform || "").toUpperCase();
  res.type("html").send(`<!doctype html>
<html><head><title>${platform} Connect</title></head>
<body style="background:#020617;color:#f1f5ff;font-family:monospace;display:grid;place-items:center;height:100vh;margin:0">
  <p>Connecting ${platform}…</p>
  <script>
    window.opener && window.opener.postMessage({
      type: '${platform}_AUTH_SUCCESS',
      platform: '${platform.toLowerCase()}'
    }, window.location.origin);
    setTimeout(function () { window.close(); }, 400);
  </script>
</body></html>`);
});

export default router;
