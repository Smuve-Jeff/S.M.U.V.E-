import {
  API_PUBLIC_URL,
  NODE_ENV,
  OAUTH_TOKEN_KEY,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
} from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import {
  inspectStreamingOAuthSetup,
  STREAMING_ACCOUNTS_TABLE,
  type StreamingOAuthSetupInput,
} from "@/services/streaming-oauth-setup-rules";

async function probeTable(): Promise<{
  state: StreamingOAuthSetupInput["table"];
  detail?: string;
}> {
  const mysql = AppDataSource.options.type === "mysql";
  const sql = mysql
    ? `SELECT 1 FROM ${STREAMING_ACCOUNTS_TABLE} LIMIT 1`
    : `SELECT 1 FROM "${STREAMING_ACCOUNTS_TABLE}" LIMIT 1`;
  try {
    await AppDataSource.query(sql);
    return { state: "ready" };
  } catch (error) {
    const code = String((error as { code?: unknown }).code ?? "");
    // PostgreSQL undefined_table / MySQL ER_NO_SUCH_TABLE.
    if (code === "42P01" || code === "ER_NO_SUCH_TABLE" || code === "1146") {
      return { state: "missing" };
    }
    return {
      state: "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Boot check for the streaming-account OAuth surface.
 *
 * Called from both entrypoints once the database is up, so a deployment with a
 * half-configured provider or no grants table fails at start instead of the
 * first time a host presses Connect. Throwing here reaches the entrypoint's
 * catch and exits non-zero; warnings only log.
 */
export async function assertStreamingOAuthSetup(): Promise<void> {
  const table = await probeTable();
  const report = inspectStreamingOAuthSetup({
    apiPublicUrl: API_PUBLIC_URL,
    nodeEnv: NODE_ENV,
    oauthTokenKey: OAUTH_TOKEN_KEY,
    credentials: [
      {
        platform: "twitch",
        clientId: TWITCH_CLIENT_ID,
        clientSecret: TWITCH_CLIENT_SECRET,
      },
      {
        platform: "youtube",
        clientId: YOUTUBE_CLIENT_ID,
        clientSecret: YOUTUBE_CLIENT_SECRET,
      },
    ],
    table: table.state,
    tableDetail: table.detail,
  });

  for (const warning of report.warnings) {
    console.warn(`[stream-accounts] ${warning}`);
  }

  if (report.problems.length) {
    throw new Error(
      `Streaming OAuth is misconfigured:\n  - ${report.problems.join("\n  - ")}`,
    );
  }

  console.log(
    report.configured.length
      ? `[stream-accounts] OAuth ready for ${report.configured.join(", ")}.`
      : "[stream-accounts] OAuth disabled: no provider credentials.",
  );
}
