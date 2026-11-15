import jwt from "jsonwebtoken";
import {
  API_PUBLIC_URL,
  JWT_SECRET,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
} from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import { StreamingAccount, type StreamingProvider } from "@/entities/StreamingAccount";
import { AppError } from "@/lib";
import { openSecret, sealSecret } from "@/lib/secret-box";

export const STREAMING_PROVIDERS = ["twitch", "youtube"] as const;

/** What the host UI is allowed to see about a linked account. */
export interface StreamingConnectionDto {
  platform: StreamingProvider;
  displayName: string;
  connectedAt: string;
  lastSyncedAt: string;
  expiresAt: string | null;
}

export interface StreamingSyncResult {
  connections: StreamingConnectionDto[];
  /** Grants that were refreshed during this sync. */
  refreshed: number;
  /** Providers whose grant was gone and has now been removed. */
  disconnected: StreamingProvider[];
  syncedAt: string;
}

interface OAuthTokens {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

interface ProviderIdentity {
  id: string;
  name: string;
}

interface ProviderDefinition {
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  scope: string;
  authorizeParams: Record<string, string>;
  /** Null until the deployment supplies this provider's app credentials. */
  credentials(): { clientId: string; clientSecret: string } | null;
  identify(accessToken: string, clientId: string): Promise<ProviderIdentity>;
}

const STATE_AUDIENCE = "stream-account-oauth";
const STATE_TTL_SECONDS = 600;
/** Refresh this long before expiry so a sync never hands out a dead token. */
const REFRESH_MARGIN_MS = 2 * 60_000;

const PROVIDERS: Record<StreamingProvider, ProviderDefinition> = {
  twitch: {
    label: "Twitch",
    authorizeUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    revokeUrl: "https://id.twitch.tv/oauth2/revoke",
    scope: "channel:read:stream_key channel:manage:broadcast",
    // `force_verify` stops Twitch from silently reusing a different account's
    // browser session when the host means to link a second channel.
    authorizeParams: { force_verify: "true" },
    credentials: () =>
      TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET
        ? { clientId: TWITCH_CLIENT_ID, clientSecret: TWITCH_CLIENT_SECRET }
        : null,
    identify: async (accessToken, clientId) => {
      const response = await fetch("https://api.twitch.tv/helix/users", {
        headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": clientId },
      });
      if (!response.ok) {
        throw new AppError(502, "Twitch did not return the connected channel.");
      }
      const body = (await response.json()) as {
        data?: { id?: string; display_name?: string; login?: string }[];
      };
      const channel = body.data?.[0];
      if (!channel?.id) {
        throw new AppError(502, "Twitch did not return the connected channel.");
      }
      return {
        id: channel.id,
        name: channel.display_name || channel.login || "Twitch channel",
      };
    },
  },
  youtube: {
    label: "YouTube",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    // Read-only on purpose: live-broadcast scopes need a Google app review,
    // and this build only links the account.
    scope:
      "https://www.googleapis.com/auth/youtube.readonly openid email profile",
    // Without these Google returns no refresh token on a repeat consent.
    authorizeParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
    credentials: () =>
      YOUTUBE_CLIENT_ID && YOUTUBE_CLIENT_SECRET
        ? { clientId: YOUTUBE_CLIENT_ID, clientSecret: YOUTUBE_CLIENT_SECRET }
        : null,
    identify: async (accessToken) => {
      const response = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) {
        throw new AppError(502, "Google did not return the connected account.");
      }
      const body = (await response.json()) as {
        sub?: string;
        name?: string;
        email?: string;
      };
      if (!body.sub) {
        throw new AppError(502, "Google did not return the connected account.");
      }
      return {
        id: body.sub,
        name: body.name || body.email || "YouTube channel",
      };
    },
  },
};

/** The callback URL registered with both providers; must match byte for byte. */
export function streamingRedirectUri(platform: StreamingProvider): string {
  return `${API_PUBLIC_URL}/api/stream-accounts/${platform}/callback`;
}

function asProvider(platform: string): StreamingProvider {
  const key = String(platform || "").toLowerCase();
  if (!(STREAMING_PROVIDERS as readonly string[]).includes(key)) {
    throw new AppError(404, `${key || "That"} is not a supported streaming account.`);
  }
  return key as StreamingProvider;
}

function requireProvider(platform: string): {
  key: StreamingProvider;
  provider: ProviderDefinition;
  credentials: { clientId: string; clientSecret: string };
} {
  const key = asProvider(platform);
  const provider = PROVIDERS[key];
  const credentials = provider.credentials();
  if (!credentials) {
    throw new AppError(
      503,
      `${provider.label} OAuth is not configured on this server. Set ${key.toUpperCase()}_CLIENT_ID and ${key.toUpperCase()}_CLIENT_SECRET.`,
    );
  }
  return { key, provider, credentials };
}

async function postForm(
  url: string,
  body: Record<string, string>,
): Promise<OAuthTokens> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const payload = (await response.json().catch(() => ({}))) as OAuthTokens & {
    error?: unknown;
    error_description?: unknown;
  };
  if (!response.ok) {
    const code =
      typeof payload.error === "string" ? payload.error : `http_${response.status}`;
    throw new AppError(502, `The provider refused the request (${code}).`, {
      providerError: code,
    });
  }
  return payload;
}

function requireAccessToken(tokens: OAuthTokens): string {
  const token = tokens.access_token;
  if (typeof token !== "string" || !token) {
    throw new AppError(502, "The provider did not return an access token.");
  }
  return token;
}

function expiryFrom(tokens: OAuthTokens): Date | null {
  const seconds = Number(tokens.expires_in);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000);
}

function toDto(row: StreamingAccount): StreamingConnectionDto {
  return {
    platform: row.platform,
    displayName: row.displayName,
    connectedAt: row.connectedAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

const repository = () =>
  AppDataSource.getRepository<StreamingAccount>("StreamingAccount");

/**
 * Build the provider URL the host's popup opens.
 *
 * `state` is a short-lived signed token carrying the account and provider, so
 * the callback can tell whose grant is arriving without a server-side state
 * table, and a callback replayed into a different account (or platform) is
 * rejected.
 */
export function createAuthorizeUrl(
  userId: number | string,
  platform: string,
): string {
  const { key, provider, credentials } = requireProvider(platform);
  const state = jwt.sign(
    { uid: String(userId), platform: key },
    JWT_SECRET,
    { audience: STATE_AUDIENCE, expiresIn: STATE_TTL_SECONDS },
  );
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", streamingRedirectUri(key));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scope);
  for (const [name, value] of Object.entries(provider.authorizeParams)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Redeem the provider's code, read the account it belongs to, and persist the
 * grant. Called by the popup callback, so it authenticates with `state` rather
 * than a bearer token.
 */
export async function completeStreamingAuthorization(
  platform: string,
  code: string,
  state: string,
): Promise<StreamingConnectionDto> {
  const { key, provider, credentials } = requireProvider(platform);
  if (!code) {
    throw new AppError(400, "The provider did not send an authorization code.");
  }

  let claim: { uid?: unknown; platform?: unknown };
  try {
    claim = jwt.verify(state, JWT_SECRET, {
      audience: STATE_AUDIENCE,
      algorithms: ["HS256"],
    }) as { uid?: unknown; platform?: unknown };
  } catch {
    throw new AppError(
      400,
      "This connect link expired. Start again from the stream tab.",
    );
  }
  if (claim.platform !== key) {
    throw new AppError(400, "This connect link belongs to another platform.");
  }
  const userId = Number(claim.uid);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AppError(400, "This connect link expired. Start again from the stream tab.");
  }

  const tokens = await postForm(provider.tokenUrl, {
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: streamingRedirectUri(key),
  });
  const accessToken = requireAccessToken(tokens);
  const identity = await provider.identify(accessToken, credentials.clientId);

  const rows = repository();
  const existing = await rows.findOne({ where: { userId, platform: key } });
  const values = {
    userId,
    platform: key,
    providerAccountId: identity.id,
    displayName: identity.name,
    accessToken: sealSecret(accessToken),
    // Providers may omit a refresh token on re-consent; keep the one we have
    // rather than silently losing the ability to renew.
    refreshToken:
      typeof tokens.refresh_token === "string" && tokens.refresh_token
        ? sealSecret(tokens.refresh_token)
        : (existing?.refreshToken ?? null),
    scopes: typeof tokens.scope === "string" ? tokens.scope : provider.scope,
    expiresAt: expiryFrom(tokens),
    connectedAt: existing?.connectedAt ?? new Date(),
    lastSyncedAt: new Date(),
  };

  if (existing) {
    await rows.update({ id: existing.id }, values);
    return toDto({ ...existing, ...values } as StreamingAccount);
  }
  return toDto(await rows.save(rows.create(values)));
}

export async function listStreamingAccounts(
  userId: number | string,
): Promise<StreamingConnectionDto[]> {
  const rows = await repository().find({
    where: { userId: Number(userId) },
    order: { connectedAt: "ASC" },
  });
  return rows.map(toDto);
}

/**
 * Re-confirm every linked account: renew grants that are at or near expiry and
 * stamp the ones that are still good. A refresh the provider definitively
 * rejects (`invalid_grant`) means the host revoked access on their side, so the
 * dead row is removed and reported instead of being shown as connected.
 */
export async function syncStreamingAccounts(
  userId: number | string,
): Promise<StreamingSyncResult> {
  const owner = Number(userId);
  const rows = repository();
  const accounts = await rows.find({ where: { userId: owner } });
  let refreshed = 0;
  const disconnected: StreamingProvider[] = [];

  for (const account of accounts) {
    const provider = PROVIDERS[account.platform];
    if (!provider) continue;
    const credentials = provider.credentials();
    const expiring =
      !account.expiresAt ||
      account.expiresAt.getTime() - Date.now() <= REFRESH_MARGIN_MS;

    if (!expiring || !account.refreshToken || !credentials) {
      account.lastSyncedAt = new Date();
      await rows.update({ id: account.id }, { lastSyncedAt: account.lastSyncedAt });
      continue;
    }

    try {
      const tokens = await postForm(provider.tokenUrl, {
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: "refresh_token",
        refresh_token: openSecret(account.refreshToken),
      });
      const accessToken = requireAccessToken(tokens);
      account.accessToken = sealSecret(accessToken);
      if (typeof tokens.refresh_token === "string" && tokens.refresh_token) {
        account.refreshToken = sealSecret(tokens.refresh_token);
      }
      account.expiresAt = expiryFrom(tokens);
      account.lastSyncedAt = new Date();
      await rows.update(
        { id: account.id },
        {
          accessToken: account.accessToken,
          refreshToken: account.refreshToken,
          expiresAt: account.expiresAt,
          lastSyncedAt: account.lastSyncedAt,
        },
      );
      refreshed += 1;
    } catch (error) {
      const detail = error instanceof AppError ? error.details : undefined;
      const providerError = (detail as { providerError?: string } | undefined)
        ?.providerError;
      if (providerError === "invalid_grant" || providerError === "invalid_token") {
        await rows.delete({ id: account.id });
        disconnected.push(account.platform);
        continue;
      }
      // A network blip or an unreadable token leaves the row in place: the
      // host can press Sync again instead of re-authorising.
      console.error(
        `[stream-accounts] could not refresh ${account.platform} for user ${owner}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    connections: await listStreamingAccounts(userId),
    refreshed,
    disconnected,
    syncedAt: new Date().toISOString(),
  };
}

/** Revoke at the provider when it supports it, then drop the local grant. */
export async function disconnectStreamingAccount(
  userId: number | string,
  platform: string,
): Promise<void> {
  const key = asProvider(platform);
  const rows = repository();
  const account = await rows.findOne({
    where: { userId: Number(userId), platform: key },
  });
  if (!account) return;

  const provider = PROVIDERS[key];
  const credentials = provider.credentials();
  try {
    const token = openSecret(account.accessToken);
    if (key === "twitch" && credentials) {
      await postForm(provider.revokeUrl, {
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        token,
      });
    } else {
      await fetch(
        `${provider.revokeUrl}?token=${encodeURIComponent(token)}`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
    }
  } catch (error) {
    // The provider may already consider it gone. The local grant is ours to
    // delete either way, and leaving it would keep a revoked account visible.
    console.error(
      `[stream-accounts] revoke failed for ${key}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  await rows.delete({ id: account.id });
}
