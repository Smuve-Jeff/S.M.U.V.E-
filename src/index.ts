import { createServer } from "node:http";
import app from "@/app";
import { DB_NAME, NODE_ENV, PORT } from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import { setupSocketIO } from "@/socket";

async function main() {
  try {
    await AppDataSource.initialize();
    console.log(`[api] Connected to database: ${DB_NAME}`);

    const server = createServer(app);
    setupSocketIO(server);

    server.listen(PORT, () => {
      console.log(`[api] http://localhost:${PORT} (${NODE_ENV})`);
      console.log(`[api] socket.io listening on ws://localhost:${PORT}`);
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
    console.error("Internal server error:", error);
    process.exit(1);
  }
}

void main();
