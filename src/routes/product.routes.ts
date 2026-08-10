import { Router } from "express";
import { AppError, parseIdParam } from "@/lib";
import { authenticate } from "@/middleware/auth";
import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  updateProduct,
} from "@/services";
import { productSchemas, validateBody } from "@/validators";

const router = Router();

// GET /api/product — list products (active by default; ?active=false includes all)
router.get("/", async (req, res) => {
  const onlyActive = req.query.active !== "false";
  res.json(await listProducts({ onlyActive }));
});

// GET /api/product/:id
router.get("/:id", async (req, res) => {
  res.json(await getProductById(parseIdParam(req.params.id)));
});

// POST /api/product — create a product owned by the authenticated user
router.post("/", authenticate, validateBody(productSchemas.create), async (req, res) => {
  if (!req.user) throw new AppError(401, "Authentication required");
  res.status(201).json(await createProduct(req.user.userId, req.body));
});

// PUT /api/product/:id — update own product (admins may update any)
router.put("/:id", authenticate, validateBody(productSchemas.update), async (req, res) => {
  if (!req.user) throw new AppError(401, "Authentication required");
  res.json(await updateProduct(parseIdParam(req.params.id), req.user, req.body));
});

// DELETE /api/product/:id — delete own product (admins may delete any)
router.delete("/:id", authenticate, async (req, res) => {
  if (!req.user) throw new AppError(401, "Authentication required");
  await deleteProduct(parseIdParam(req.params.id), req.user);
  res.status(204).end();
});

export default router;
