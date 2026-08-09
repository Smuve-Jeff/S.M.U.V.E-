import { Router } from "express";

/**
 * project routes stub — see src/routes/auth.routes.ts.
 *
 * Mounted as both `/api/projects` (default) and `/api/identity`
 * (named export) in src/app.ts:
 *
 *   import projectsRouter, { identityRouter } from "@/routes/project.routes";
 *   app.use("/api/projects", projectsRouter);
 *   app.use("/api/identity", identityRouter);
 */
const router: Router = Router();
const identityRouter: Router = Router();

export { identityRouter };
export default router;
