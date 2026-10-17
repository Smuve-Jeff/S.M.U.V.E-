import { Router } from "express";
import type { Request } from "express";
import { AppError } from "@/lib";
import { authenticate } from "@/middleware/auth";
import {
  createConnectorJob,
  listConnectorJobs,
  listProjects,
  loadArtistIdentity,
  loadProject,
  saveArtistIdentity,
  saveProject,
} from "@/services";

/**
 * Resolve the userId a request may act on. Callers may only write their own
 * data (admins may act on anyone). When `routeUserId` is supplied (a URL
 * param) it must match the caller unless the caller is an admin.
 */
const resolveOwnedUserId = (req: Request, routeUserId?: string): string => {
  const me = req.user;
  if (!me) throw new AppError(401, "Authentication required");
  const target = routeUserId ?? String(req.body?.userId ?? me.userId);
  if (me.role !== "admin" && target !== String(me.userId)) {
    throw new AppError(403, "Access denied. Strategic breach detected.");
  }
  return target;
};

// ─── /api/projects ───────────────────────────────────────────────────────────

export const projectsRouter = Router();
projectsRouter.use(authenticate);

// POST /api/projects — upsert a project snapshot owned by the caller.
projectsRouter.post("/", async (req, res) => {
  const userId = resolveOwnedUserId(req);
  res.json(
    await saveProject({
      projectId: req.body?.projectId,
      userId,
      title: req.body?.title,
      projectData: req.body?.projectData,
    }),
  );
});

// GET /api/projects/:userId/:projectId
projectsRouter.get("/:userId/:projectId", async (req, res) => {
  const userId = resolveOwnedUserId(req, req.params.userId);
  const row = await loadProject(userId, req.params.projectId);
  res.json({ ...row, data: row.projectData });
});

// GET /api/projects/:userId
projectsRouter.get("/:userId", async (req, res) => {
  const userId = resolveOwnedUserId(req, req.params.userId);
  res.json(await listProjects(userId));
});

// ─── /api/identity ───────────────────────────────────────────────────────────

export const identityRouter = Router();
identityRouter.use(authenticate);

// POST /api/identity — upsert identity + optional profile snapshot.
identityRouter.post("/", async (req, res) => {
  const userId = resolveOwnedUserId(req);
  res.json(
    await saveArtistIdentity({
      userId,
      identity: req.body?.identity,
      profileData: req.body?.profileData,
    }),
  );
});

// GET /api/identity/:userId
identityRouter.get("/:userId", async (req, res) => {
  const userId = resolveOwnedUserId(req, req.params.userId);
  res.json(await loadArtistIdentity(userId));
});

// GET /api/identity/:userId/connectors
identityRouter.get("/:userId/connectors", async (req, res) => {
  const userId = resolveOwnedUserId(req, req.params.userId);
  res.json(await listConnectorJobs(userId));
});

// POST /api/identity/:userId/connectors — queue a connector job.
identityRouter.post("/:userId/connectors", async (req, res) => {
  const userId = resolveOwnedUserId(req, req.params.userId);
  res.status(201).json(
    await createConnectorJob({
      userId,
      job: req.body?.job,
    }),
  );
});

export default projectsRouter;
