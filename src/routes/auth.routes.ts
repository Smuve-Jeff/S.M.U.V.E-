import { Router } from "express";
import { AppError } from "@/lib";
import { authenticate } from "@/middleware/auth";
import { getUserById, loginUser, registerUser } from "@/services";
import { authSchemas, validateBody } from "@/validators";

const router = Router();

// POST /api/auth/register — create account, return JWT + user
router.post("/register", validateBody(authSchemas.register), async (req, res) => {
  const result = await registerUser(req.body);
  res.status(201).json(result);
});

// POST /api/auth/login — verify credentials, return JWT + user
router.post("/login", validateBody(authSchemas.login), async (req, res) => {
  const result = await loginUser(req.body);
  res.json(result);
});

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
    }, '*');
    setTimeout(function () { window.close(); }, 400);
  </script>
</body></html>`);
});

export default router;
