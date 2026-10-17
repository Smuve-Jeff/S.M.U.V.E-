import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import {
  listRemixLineageForProject,
  listSessionsForProject,
} from "@/services";

const router = Router();

// GET /api/studio/sessions/:projectId — sessions touching a project.
router.get("/sessions/:projectId", authenticate, async (req, res) => {
  res.json(await listSessionsForProject(req.params.projectId));
});

// GET /api/remix/lineage/:projectId — remix provenance for a project.
// (Router is mounted at BOTH /api/studio and /api/remix in app.ts, so the
// path here is relative to /api/remix.)
router.get("/lineage/:projectId", authenticate, async (req, res) => {
  res.json(await listRemixLineageForProject(req.params.projectId));
});

export default router;
