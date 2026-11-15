import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { APP_ORIGIN } from "@/config/env";
import { AppError } from "@/lib";
import { authenticate } from "@/middleware/auth";
import {
  completeStreamingAuthorization,
  createAuthorizeUrl,
  disconnectStreamingAccount,
  listStreamingAccounts,
  syncStreamingAccounts,
} from "@/services/streaming-oauth.service";

const router = Router();

/**
 * Starting a connect round mints a signed state and a provider URL. A host
 * links a handful of accounts, so a small per-account budget is plenty and
 * keeps this from being a free URL signer.
 */
const connectLimiter = rateLimit({
  windowMs: 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  // Behind `authenticate`, so the account is always the right bucket.
  keyGenerator: (req: Request) => `stream-connect:${req.user?.userId ?? "unknown"}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "Too many connect attempts. Try again in a minute." },
});

function platformOf(req: Request): string {
  return String(req.params.platform || "").toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The page the provider redirects the popup to.
 *
 * It carries the result back to the opener as a postMessage (the client only
 * accepts messages from the API or its own origin) and closes itself. Failure
 * is still HTTP 200: this is a human-facing page, not an API response, and a
 * non-2xx would replace it with the browser's own error screen.
 */
function popupPage(platform: string, result: { message?: string; displayName?: string }): string {
  const label = escapeHtml(platform.toUpperCase() || "PLATFORM");
  const failed = typeof result.message === "string" && result.message.length > 0;
  const payload = JSON.stringify({
    type: `${platform.toUpperCase()}_AUTH_${failed ? "FAILED" : "SUCCESS"}`,
    platform,
    message: result.message ?? "",
    displayName: result.displayName ?? "",
  }).replace(/</g, "\\u003c");
  const heading = failed ? `${label} NOT CONNECTED` : `${label} CONNECTED`;
  const detail = escapeHtml(
    failed
      ? (result.message as string)
      : `Signed in as ${result.displayName ?? "your account"}. You can close this window.`,
  );

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${heading}</title></head>
<body style="background:#020617;color:#f1f5ff;font-family:monospace;display:grid;place-items:center;height:100vh;margin:0;text-align:center">
  <div>
    <p style="font-size:14px;letter-spacing:.12em;margin:0 0 .6rem">${heading}</p>
    <p style="font-size:11px;color:#8ea0b8;margin:0">${detail}</p>
  </div>
  <script>
    (function () {
      var payload = ${payload};
      try {
        if (window.opener) {
          window.opener.postMessage(payload, ${JSON.stringify(APP_ORIGIN)});
        }
      } catch (error) {
        /* a closed opener is not an error worth showing */
      }
      setTimeout(function () { window.close(); }, ${failed ? 4000 : 700});
    })();
  </script>
</body></html>`;
}

// GET /api/stream-accounts — the caller's linked accounts (never tokens).
router.get("/", authenticate, async (req, res) => {
  res.json({ connections: await listStreamingAccounts(req.user!.userId) });
});

// POST /api/stream-accounts/sync — renew near-expiry grants, return fresh state.
router.post("/sync", authenticate, async (req, res) => {
  res.json(await syncStreamingAccounts(req.user!.userId));
});

// POST /api/stream-accounts/:platform/authorize — mint the popup URL.
router.post("/:platform/authorize", authenticate, connectLimiter, async (req, res) => {
  res.json({ authorizeUrl: createAuthorizeUrl(req.user!.userId, platformOf(req)) });
});

// DELETE /api/stream-accounts/:platform — revoke and forget the grant.
router.delete("/:platform", authenticate, async (req, res) => {
  await disconnectStreamingAccount(req.user!.userId, platformOf(req));
  res.status(204).end();
});

// GET /api/stream-accounts/:platform/callback — the provider's redirect target.
// Unauthenticated by necessity (the provider has no session), which is why the
// signed `state` is what binds this grant to one account.
router.get("/:platform/callback", async (req, res) => {
  const platform = platformOf(req);
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const providerError = typeof req.query.error === "string" ? req.query.error : "";

  try {
    if (providerError) {
      throw new AppError(
        400,
        providerError === "access_denied"
          ? "You cancelled the connection."
          : "The provider refused the connection.",
      );
    }
    if (!code || !state) {
      throw new AppError(400, "The provider did not send an authorization code.");
    }
    const connection = await completeStreamingAuthorization(platform, code, state);
    res.type("html").send(popupPage(platform, { displayName: connection.displayName }));
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "The connection could not be completed.";
    console.error(
      `[stream-accounts] ${platform} callback failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    res.type("html").send(popupPage(platform, { message }));
  }
});

export default router;
