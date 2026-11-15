import { decodeOAuthTokenKey } from "@/lib/secret-box";

export type StreamingOAuthProvider = "twitch" | "youtube";

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
        `API_PUBLIC_URL is ${input.apiPublicUrl}, which Twitch and Google cannot redirect to in production.`,
      );
    }
  } else {
    warnings.push(
      "No Twitch or YouTube OAuth credentials are set: Connect answers 503 and the accounts panel stays read-only.",
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
