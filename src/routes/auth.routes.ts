import { Router } from "express";

/**
 * auth routes stub — see src/services/user.service.ts for the
 * migration rationale. Real `/api/auth/**` handlers (signup, login,
 * session refresh, logout, JWT mint) live in server/index.js today;
 * the migration to TypeScript will land in a follow-up that swaps
 * this stub for the real router without changing the mount path
 * (`app.use("/api/auth", authRoutes)` in src/app.ts).
 */
const router: Router = Router();

export default router;
