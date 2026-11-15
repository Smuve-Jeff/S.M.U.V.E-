import {
  API_PUBLIC_URL,
  NODE_ENV,
  MEDIA_RELAY_PROBE_TIMEOUT_MS,
  MEDIA_RELAY_TOKEN,
  MEDIA_RELAY_URL,
  OAUTH_TOKEN_KEY,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_RTMP_URL,
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
} from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import {
  inspectStreamingOAuthSetup,
  STREAMING_ACCOUNTS_TABLE,
  type StreamingOAuthSetupInput,
} from "@/services/streaming-oauth-setup-rules";

type RelayProbe = "ok" | "degraded" | "unreachable";

/**
 * Ask the relay whether it (and the MediaMTX behind it) is ready.
 *
 * Called once at boot: a relay that is configured but cannot reach its media
 * server would accept sessions and drop every stream, which is worse than
 * refusing to start.
 */
async function probeRelay(
  relayUrl: string,
  token: string,
): Promise<RelayProbe> {
  const base = relayUrl.trim().replace(/\/+$/, "");
  if (!base) return "unreachable";
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
    const response = await fetch(`${base}/health`, {
      headers,
      signal: AbortSignal.timeout(MEDIA_RELAY_PROBE_TIMEOUT_MS),
    });
    if (response.ok) return "ok";
    // A 503 is the relay reporting a degraded media server; anything else is a
    // relay we cannot trust (auth, wrong URL, not a relay at all).
    return response.status === 503 ? "degraded" : "unreachable";
  } catch (error) {
    console.warn(
      `[stream-accounts] relay health probe failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return "unreachable";
  }
}

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
  const relayProbe = MEDIA_RELAY_URL
    ? await probeRelay(MEDIA_RELAY_URL, MEDIA_RELAY_TOKEN)
    : "unreachable";
  const report = inspectStreamingOAuthSetup({
    apiPublicUrl: API_PUBLIC_URL,
    nodeEnv: NODE_ENV,
    oauthTokenKey: OAUTH_TOKEN_KEY,
    mediaRelayUrl: MEDIA_RELAY_URL,
    mediaRelayToken: MEDIA_RELAY_TOKEN,
    twitchRtmpUrl: TWITCH_RTMP_URL,
    relayProbe,
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
