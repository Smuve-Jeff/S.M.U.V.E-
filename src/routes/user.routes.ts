import { Router } from "express";
import { AppError, parseIdParam } from "@/lib";
import { authenticate, requireRole } from "@/middleware/auth";
import { deleteUser, getUserById, listUsers, updateUser } from "@/services";
import { userSchemas, validateBody } from "@/validators";

const router = Router();

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
router.put("/:id", validateBody(userSchemas.update), async (req, res) => {
  const id = parseIdParam(req.params.id);
  const me = req.user;
  if (!me) throw new AppError(401, "Authentication required");

  if (me.role !== "admin" && id !== me.userId) {
    throw new AppError(403, "You can only update your own profile");
  }
  if (req.body.role !== undefined && me.role !== "admin") {
    throw new AppError(403, "Only admins can change roles");
  }

  res.json(await updateUser(id, req.body));
});

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
