import { decodeOAuthTokenKey } from "@/lib/secret-box";

export type StreamingOAuthProvider =
  | "twitch"
  | "youtube"
  | "kick"
  | "facebook";

/** The table the OAuth flow writes grants into. */
export const STREAMING_ACCOUNTS_TABLE = "streaming_accounts";

export const PROVIDER_VARS: Record<
  StreamingOAuthProvider,
  { label: string; idVar: string; secretVar: string }
> = {
  twitch: {
    label: "Twitch",
    idVar: "TWITCH_CLIENT_ID",
    secretVar: "TWITCH_CLIENT_SECRET",
  },
  youtube: {
    label: "YouTube",
    idVar: "YOUTUBE_CLIENT_ID",
    secretVar: "YOUTUBE_CLIENT_SECRET",
  },
  kick: {
    label: "Kick",
    idVar: "KICK_CLIENT_ID",
    secretVar: "KICK_CLIENT_SECRET",
  },
  facebook: {
    label: "Facebook",
    idVar: "FACEBOOK_CLIENT_ID",
    secretVar: "FACEBOOK_CLIENT_SECRET",
  },
};

export interface StreamingOAuthSetupInput {
  apiPublicUrl: string;
  nodeEnv: string;
  oauthTokenKey: string;
  credentials: {
    platform: StreamingOAuthProvider;
    clientId: string;
    clientSecret: string;
  }[];
  /** WHIP→RTMP relay control API; blank means push is disabled. */
  mediaRelayUrl: string;
  mediaRelayToken: string;
  /** Twitch ingest base the relay pushes to. */
  twitchRtmpUrl: string;
  /** Result of the relay's own health probe, when a relay is configured. */
  relayProbe: "ok" | "degraded" | "unreachable";
  table: "ready" | "missing" | "unavailable";
  tableDetail?: string;
}

export interface StreamingOAuthSetupReport {
  /** Providers with both credentials present — the ones the UI can offer. */
  configured: StreamingOAuthProvider[];
  /** Deploy-stopping problems. */
  problems: string[];
  /** Things an operator should know but that do not block the deploy. */
  warnings: string[];
}

/**
 * Decide whether this deployment can actually link a streaming account.
 *
 * Kept pure so the rules are testable without a database, and so the boot check
 * only has to gather inputs. The distinction that matters: a deployment with no
 * provider credentials is a legitimate configuration (the feature is off and
 * says so), while a *half*-configured provider, a callback base URL the provider
 * cannot reach, or a missing grants table are deployments that look fine and
 * then fail in a host's face.
 */
export function inspectStreamingOAuthSetup(
  input: StreamingOAuthSetupInput,
): StreamingOAuthSetupReport {
  const configured: StreamingOAuthProvider[] = [];
  const problems: string[] = [];
  const warnings: string[] = [];

  for (const { platform, clientId, clientSecret } of input.credentials) {
    const vars = PROVIDER_VARS[platform];
    const hasId = !!clientId.trim();
    const hasSecret = !!clientSecret.trim();
    if (hasId && hasSecret) {
      configured.push(platform);
      continue;
    }
    if (hasId || hasSecret) {
      problems.push(
        `${vars.label} OAuth is half-configured: ${hasId ? vars.secretVar : vars.idVar} is missing. Set both or neither.`,
      );
    }
  }

  const enabled = configured.length > 0;

  if (enabled) {
    let origin: URL | null = null;
    try {
      origin = new URL(input.apiPublicUrl);
    } catch {
      origin = null;
    }
    if (!origin || (origin.protocol !== "http:" && origin.protocol !== "https:")) {
      problems.push(
        `API_PUBLIC_URL must be the absolute http(s) origin providers redirect back to (got "${input.apiPublicUrl}").`,
      );
    } else if (
      input.nodeEnv === "production" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(origin.hostname)
    ) {
      problems.push(
        `API_PUBLIC_URL is ${input.apiPublicUrl}, which the streaming providers cannot redirect to in production.`,
      );
    }
  } else {
    warnings.push(
      "No streaming OAuth credentials are set: Connect answers 503 and the accounts panel stays read-only.",
    );
  }

  const key = input.oauthTokenKey.trim();
  if (key && !decodeOAuthTokenKey(key)) {
    warnings.push(
      "OAUTH_TOKEN_KEY is set but is not 32 bytes (64 hex characters or base64). A key derived from that value is used instead, so correcting it later makes already-stored tokens unreadable.",
    );
  }
  if (enabled && !key) {
    warnings.push(
      "OAUTH_TOKEN_KEY is not set: stored tokens are sealed with a key derived from JWT_SECRET, so rotating JWT_SECRET requires reconnecting every account.",
    );
  }

  const relay = input.mediaRelayUrl.trim();
  if (relay) {
    let relayUrl: URL | null = null;
    try {
      relayUrl = new URL(relay);
    } catch {
      relayUrl = null;
    }
    if (!relayUrl || (relayUrl.protocol !== "http:" && relayUrl.protocol !== "https:")) {
      problems.push(
        `MEDIA_RELAY_URL must be the absolute http(s) address of the relay control API (got "${input.mediaRelayUrl}").`,
      );
    }
    if (input.relayProbe === "degraded") {
      problems.push(
        "The broadcast relay is up but cannot reach MediaMTX, so every push would fail. Fix MEDIAMTX_API_URL (or the media server) before a host goes live.",
      );
    } else if (input.relayProbe === "unreachable") {
      problems.push(
        `The broadcast relay at ${relay} did not answer its health probe. Start it, or clear MEDIA_RELAY_URL to disable pushing.`,
      );
    }
    if (!input.mediaRelayToken.trim()) {
      warnings.push(
        "MEDIA_RELAY_TOKEN is not set: anyone who can reach the relay can open sessions on it.",
      );
    }
  } else {
    warnings.push(
      "MEDIA_RELAY_URL is not set: pushing a broadcast to Twitch or Kick answers 503 until a relay is configured.",
    );
  }

  if (!/^rtmps?:\/\//i.test(input.twitchRtmpUrl.trim())) {
    problems.push(
      `TWITCH_RTMP_URL must be an rtmp(s) ingest URL (got "${input.twitchRtmpUrl}").`,
    );
  }

  if (input.table === "missing") {
    if (enabled) {
      problems.push(
        `The ${STREAMING_ACCOUNTS_TABLE} table is missing. Run \`npm run mg:run\` (or apply migrations) before serving OAuth.`,
      );
    } else {
      warnings.push(
        `The ${STREAMING_ACCOUNTS_TABLE} table is missing. Run \`npm run mg:run\` before enabling OAuth.`,
      );
    }
  } else if (input.table === "unavailable") {
    problems.push(
      `Could not verify the ${STREAMING_ACCOUNTS_TABLE} table: ${input.tableDetail ?? "unknown database error"}.`,
    );
  }

  return { configured, problems, warnings };
}
