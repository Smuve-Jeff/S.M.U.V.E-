import { createServer } from "node:http";
import app from "@/app";
import { DB_NAME, NODE_ENV, PORT } from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import {
  setFriendLiveEndNotifier,
  setFriendLiveNotifier,
  setupSocketIO,
} from "@/socket";
import { logEmailConfiguration } from "@/services/email.service";

async function main() {
  try {
    await AppDataSource.initialize();
    console.log(`[api] Connected to database: ${DB_NAME}`);
    logEmailConfiguration();

    // Streaming-account OAuth: a half-configured provider or a missing grants
    // table must stop the deploy here instead of failing in a host's face.
    const { assertStreamingOAuthSetup } = await import(
      "@/services/streaming-oauth-setup"
    );
    await assertStreamingOAuthSetup();

    const server = createServer(app);
    setupSocketIO(server);
    // Loaded here, at boot: the notifier owns the entity-backed friend query,
    // so a static import would drag TypeORM entities into every module that
    // merely imports this entrypoint (the unified-app tests included).
    const { notifyFriendsWentLive, notifyFriendsLiveEnded } = await import(
      "@/services/friend-live-notifier"
    );
    setFriendLiveNotifier(notifyFriendsWentLive);
    setFriendLiveEndNotifier(notifyFriendsLiveEnded);

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
