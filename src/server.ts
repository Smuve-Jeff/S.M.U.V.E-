import path from "node:path";
import express from "express";
import { createServer } from "node:http";
import apiApp from "@/app";
import { setupSocketIO } from "@/socket";
import { AppDataSource } from "@/database/data-source";
import { DB_NAME, NODE_ENV, PORT } from "@/config/env";

/**
 * Unified production entrypoint: serves the compiled Angular bundle
 * (Build/browser) and the Express API on a single HTTP server so one Render
 * web service can host the whole app same-origin — no CORS, no second host.
 */
export interface UnifiedAppOptions {
  /** Compiled Angular output directory. Defaults to <repo>/Build/browser. */
  browserDir?: string;
}

export function createUnifiedApp(options: UnifiedAppOptions = {}): express.Express {
  const browserDir = options.browserDir ?? path.resolve(__dirname, "..", "browser");

  const unified = express();
  unified.disable("x-powered-by");

  // 1) Real static assets (JS/CSS/fonts/media/favicon).
  unified.use(express.static(browserDir));

  // 2) SPA fallback for client-side routes (/login, /hub, ...) that never
  //    touch /api, so deep links and hard refreshes render the app shell.
  unified.use((req, res, next) => {
    if (
      req.method === "GET" &&
      !req.path.startsWith("/api/") &&
      req.path !== "/api" &&
      req.accepts("html")
    ) {
      res.sendFile(path.join(browserDir, "index.html"));
      return;
    }
    next();
  });

  // 3) The full API surface, including /api/health and its JSON 404 handler.
  unified.use(apiApp);

  return unified;
}

async function main(): Promise<void> {
  try {
    await AppDataSource.initialize();
    console.log(`[api] Connected to database: ${DB_NAME}`);

    const unified = createUnifiedApp();
    const server = createServer(unified);
    setupSocketIO(server);

    server.listen(PORT, () => {
      console.log(`[api] unified server listening on :${PORT} (${NODE_ENV})`);
    });

    const shutdown = async (signal: string) => {
      console.log(`[api] ${signal} received — shutting down...`);
      server.close(async () => {
        await AppDataSource.destroy().catch(() => undefined);
        process.exit(0);
      });
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    console.error("[api] fatal startup error:", error);
    process.exit(1);
  }
}

// Only boot when executed directly; tests import createUnifiedApp instead.
if (require.main === module) {
  void main();
}
