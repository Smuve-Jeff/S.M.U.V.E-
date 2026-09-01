import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";
import { FRONTEND_URL, NODE_ENV } from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import { errorHandler, notFoundHandler } from "@/lib";
import authRoutes from "@/routes/auth.routes";
import productRoutes from "@/routes/product.routes";
import userRoutes from "@/routes/user.routes";
import profileRoutes from "@/routes/profile.routes";
import socialRoutes from "@/routes/social.routes";
import studioRoutes from "@/routes/studio.routes";
import aiRoutes from "@/routes/ai.routes";
import uploadRoutes from "@/routes/upload.routes";
import projectsRouter, { identityRouter } from "@/routes/project.routes";
import gameInviteRoutes from "@/routes/game-invite.routes";
import liveStreamRoutes from "@/routes/live-stream.routes";
import roomRoutes from "@/routes/room.routes";

const app = express();

// Trust Cloudflare / reverse-proxy headers so rate limiting and logging work correctly.
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Monitor HTTP requests (logger)
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

// Protect HTTP headers (security)
app.use(helmet());

// Enable access from allowed origins (comma-separated in FRONTEND_URL)
const allowedOrigins = FRONTEND_URL.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// Limit number of requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Parse JSON bodies
app.use(express.json());

// Handle cookies
app.use(cookieParser());

// GET /api/health — liveness + database connectivity check
app.get("/api/health", async (_req, res) => {
  let db = "up";
  try {
    await AppDataSource.query("SELECT 1");
  } catch {
    db = "down";
  }
  const healthy = db === "up";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    db,
    timestamp: new Date().toISOString(),
  });
});

// API endpoints
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/product", productRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/users", socialRoutes);
app.use("/api/studio", studioRoutes);
app.use("/api/remix", studioRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/projects", projectsRouter);
app.use("/api/identity", identityRouter);
app.use("/api/games", gameInviteRoutes);
app.use("/api/rooms", roomRoutes);
// Live-stream / Go-Live surfaces. Mounted at /api/users for per-host
// authorization, plus a public /api/live-streams prefix for the
// viewer tap-to-join lookup.
app.use("/api", liveStreamRoutes);

// 404 + central error handling (must be mounted last)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
