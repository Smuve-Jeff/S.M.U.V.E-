import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import {
  API_PUBLIC_URL,
  FACEBOOK_CLIENT_ID,
  FACEBOOK_CLIENT_SECRET,
  JWT_SECRET,
  KICK_CLIENT_ID,
  KICK_CLIENT_SECRET,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
} from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import { StreamingAccount, type StreamingProvider } from "@/entities/StreamingAccount";
import { StreamingDestination } from "@/entities/StreamingDestination";
import { AppError } from "@/lib";
import { openSecret, sealSecret } from "@/lib/secret-box";

export const STREAMING_PROVIDERS = [
  "twitch",
  "youtube",
  "kick",
  "facebook",
] as const;

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

interface Credentials {
  clientId: string;
  clientSecret: string;
}

interface ProviderDefinition {
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  scope: string;
  authorizeParams: Record<string, string>;
  /** Kick mandates OAuth 2.1 PKCE (S256) on the authorization code flow. */
  pkce?: boolean;
  /** The token endpoint takes query parameters (GET), not a form body. */
  tokenQuery?: boolean;
  /** Null until the deployment supplies this provider's app credentials. */
  credentials(): Credentials | null;
  identify(accessToken: string, clientId: string): Promise<ProviderIdentity>;
  /** Swap a just-issued grant for a longer-lived one where the provider allows. */
  afterExchange?(
    tokens: OAuthTokens,
    credentials: Credentials,
  ): Promise<OAuthTokens>;
  /** Provider-specific revocation; the standard form POST when absent. */
  revoke?(accessToken: string, credentials: Credentials | null): Promise<void>;
}

const STATE_AUDIENCE = "stream-account-oauth";
const STATE_TTL_SECONDS = 600;
/** Graph API version for Facebook OAuth; bump with the provider's releases. */
const META_GRAPH_VERSION = "v27.0";
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
  kick: {
    label: "Kick",
    authorizeUrl: "https://id.kick.com/oauth/authorize",
    tokenUrl: "https://id.kick.com/oauth/token",
    revokeUrl: "https://id.kick.com/oauth/revoke",
    // streamkey:read is what lets the connector fill the Kick RTMP row with
    // the channel's own ingest URL and key instead of asking the host to copy
    // them out of the dashboard.
    scope: "user:read channel:read streamkey:read",
    authorizeParams: {},
    pkce: true,
    credentials: () =>
      KICK_CLIENT_ID && KICK_CLIENT_SECRET
        ? { clientId: KICK_CLIENT_ID, clientSecret: KICK_CLIENT_SECRET }
        : null,
    identify: async (accessToken) => {
      const response = await fetch("https://api.kick.com/public/v1/users", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new AppError(502, "Kick did not return the connected channel.");
      }
      const body = (await response.json()) as {
        data?: { user_id?: number | string; name?: string; username?: string }[];
      };
      const user = body.data?.[0];
      const id = user?.user_id === undefined ? "" : String(user.user_id);
      if (!id) {
        throw new AppError(502, "Kick did not return the connected channel.");
      }
      return {
        id,
        name: user?.name || user?.username || "Kick channel",
      };
    },
    revoke: async (accessToken) => {
      // Kick documents the hint parameter under two names; it is optional, so
      // send the token alone rather than guess which one this deployment wants.
      await fetch(
        `https://id.kick.com/oauth/revoke?token=${encodeURIComponent(accessToken)}`,
        { method: "POST" },
      );
    },
  },
  facebook: {
    label: "Facebook",
    authorizeUrl: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`,
    revokeUrl: `https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions`,
    // public_profile names the account; the Page scopes plus publish_video let
    // the connector create a Live Video and use its ingest URL. publish_video
    // needs App Review before non-test users can connect.
    scope:
      "public_profile pages_show_list pages_read_engagement publish_video",
    authorizeParams: {},
    tokenQuery: true,
    credentials: () =>
      FACEBOOK_CLIENT_ID && FACEBOOK_CLIENT_SECRET
        ? {
            clientId: FACEBOOK_CLIENT_ID,
            clientSecret: FACEBOOK_CLIENT_SECRET,
          }
        : null,
    afterExchange: async (tokens, credentials) => {
      const short = typeof tokens.access_token === "string" ? tokens.access_token : "";
      if (!short) return tokens;
      // The code exchange issues a short-lived token; trade it for the ~60-day
      // one so a link survives past the current broadcast.
      const url = new URL(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`,
      );
      url.searchParams.set("grant_type", "fb_exchange_token");
      url.searchParams.set("client_id", credentials.clientId);
      url.searchParams.set("client_secret", credentials.clientSecret);
      url.searchParams.set("fb_exchange_token", short);
      const response = await fetch(url);
      const body = (await response.json().catch(() => ({}))) as OAuthTokens;
      if (!response.ok || typeof body.access_token !== "string") return tokens;
      return {
        ...tokens,
        access_token: body.access_token,
        expires_in: body.expires_in ?? tokens.expires_in,
      };
    },
    identify: async (accessToken) => {
      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me`);
      url.searchParams.set("fields", "id,name");
      url.searchParams.set("access_token", accessToken);
      const response = await fetch(url);
      if (!response.ok) {
        throw new AppError(
          502,
          "Facebook did not return the connected account.",
        );
      }
      const body = (await response.json()) as { id?: string; name?: string };
      if (!body.id) {
        throw new AppError(
          502,
          "Facebook did not return the connected account.",
        );
      }
      return { id: body.id, name: body.name || "Facebook account" };
    },
    revoke: async (accessToken) => {
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
        { method: "DELETE" },
      );
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

async function readTokens(response: Response): Promise<OAuthTokens> {
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
  return readTokens(response);
}

/** Facebook's token endpoint reads its grants from the query string. */
async function getQuery(
  url: string,
  query: Record<string, string>,
): Promise<OAuthTokens> {
  const target = new URL(url);
  for (const [name, value] of Object.entries(query)) {
    target.searchParams.set(name, value);
  }
  const response = await fetch(target, { headers: { Accept: "application/json" } });
  return readTokens(response);
}

/** Redeem or refresh a grant the way this provider's token endpoint expects. */
function requestTokens(
  provider: ProviderDefinition,
  credentials: Credentials,
  params: Record<string, string>,
): Promise<OAuthTokens> {
  const body = {
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    ...params,
  };
  return provider.tokenQuery
    ? getQuery(provider.tokenUrl, body)
    : postForm(provider.tokenUrl, body);
}

/**
 * PKCE pair for Kick. The verifier rides inside the signed state so the
 * callback can finish the exchange without a server-side state table; it is
 * short-lived and useless without the authorization code.
 */
function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
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
  const pkce = provider.pkce ? pkcePair() : null;
  const state = jwt.sign(
    {
      uid: String(userId),
      platform: key,
      ...(pkce ? { verifier: pkce.verifier } : {}),
    },
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
  if (pkce) {
    url.searchParams.set("code_challenge", pkce.challenge);
    url.searchParams.set("code_challenge_method", "S256");
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

  let claim: { uid?: unknown; platform?: unknown; verifier?: unknown };
  try {
    claim = jwt.verify(state, JWT_SECRET, {
      audience: STATE_AUDIENCE,
      algorithms: ["HS256"],
    }) as { uid?: unknown; platform?: unknown; verifier?: unknown };
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

  const verifier =
    typeof claim.verifier === "string" ? claim.verifier : "";
  if (provider.pkce && !verifier) {
    throw new AppError(
      400,
      "This connect link expired. Start again from the stream tab.",
    );
  }
  const issued = await requestTokens(provider, credentials, {
    code,
    grant_type: "authorization_code",
    redirect_uri: streamingRedirectUri(key),
    ...(verifier ? { code_verifier: verifier } : {}),
  });
  const tokens = provider.afterExchange
    ? await provider.afterExchange(issued, credentials)
    : issued;
  const accessToken = requireAccessToken(tokens);
  const identity = await provider.identify(accessToken, credentials.clientId);

  const rows = repository();
  const existing = await rows.findOne({ where: { userId, platform: key } });
  // Facebook needs a Page, not just a person: pick the first Page the host
  // manages and keep that Page's own token for Live Video calls.
  // Reconnecting must not undo the Page the host picked from the selector.
  const pages = key === "facebook" ? await facebookPages(accessToken) : [];
  const page =
    pages.find((candidate) => candidate.id === existing?.pageId) ??
    pages[0] ??
    null;
  const values = {
    userId,
    platform: key,
    providerAccountId: identity.id,
    displayName: page?.name || identity.name,
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
    ...(key === "facebook"
      ? {
          pageId: page?.id ?? existing?.pageId ?? null,
          pageToken: page?.token
            ? sealSecret(page.token)
            : (existing?.pageToken ?? null),
        }
      : {}),
  };

  let saved: StreamingAccount;
  if (existing) {
    await rows.update({ id: existing.id }, values);
    saved = { ...existing, ...values } as StreamingAccount;
  } else {
    saved = await rows.save(rows.create(values));
  }
  if (key === "kick") {
    await provisionKickDestination(userId, accessToken);
  }
  return toDto(saved);
}

interface FacebookPage {
  id: string;
  name: string;
  token: string;
}

/** Every Page the grant can publish to, with its own Page token. */
async function facebookPages(accessToken: string): Promise<FacebookPage[]> {
  try {
    const url = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts`,
    );
    url.searchParams.set("fields", "id,name,access_token");
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url);
    if (!response.ok) return [];
    const body = (await response.json()) as {
      data?: { id?: unknown; name?: unknown; access_token?: unknown }[];
    };
    const pages = (body.data ?? [])
      .filter(
        (row) =>
          typeof row.id === "string" && typeof row.access_token === "string",
      )
      .map((row) => ({
        id: row.id as string,
        name: typeof row.name === "string" ? row.name : "Facebook Page",
        token: row.access_token as string,
      }));
    if (!pages.length) {
      console.warn(
        "[stream-accounts] Facebook account manages no Page; live video stays on the manual RTMP row.",
      );
    }
    return pages;
  } catch (error) {
    console.warn(
      `[stream-accounts] could not read Facebook Pages: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

/**
 * Read the channel's own ingest URL and key with `streamkey:read` and park them
 * in the Kick destination row. A failure here never fails the connection: the
 * host can still paste the values from the dashboard.
 */
async function provisionKickDestination(
  userId: number,
  accessToken: string,
): Promise<void> {
  try {
    const response = await fetch("https://api.kick.com/public/v1/channels", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return;
    const body = (await response.json()) as {
      data?: { stream?: { url?: unknown; key?: unknown } }[];
    };
    const stream = body.data?.[0]?.stream;
    const rtmpUrl = typeof stream?.url === "string" ? stream.url.trim() : "";
    const streamKey = typeof stream?.key === "string" ? stream.key.trim() : "";
    if (!/^rtmps?:\/\/\S+$/i.test(rtmpUrl) || !streamKey) return;
    const rows = AppDataSource.getRepository<StreamingDestination>(
      "StreamingDestination",
    );
    const existing = await rows.findOne({
      where: { userId, platform: "kick" },
    });
    // A key the host pasted stays: it may point at a different ingest on
    // purpose, and silently replacing it would break a working destination.
    if (existing) return;
    await rows.save(
      rows.create({
        userId,
        platform: "kick",
        label: "KICK",
        rtmpUrl,
        streamKey: sealSecret(streamKey),
      }),
    );
  } catch (error) {
    console.warn(
      `[stream-accounts] could not read the Kick stream key: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export interface AccountAccessToken {
  accessToken: string;
  refreshed: boolean;
}

/**
 * A usable access token for a stored grant, refreshed and persisted when it is
 * at or near expiry. Sync and the broadcast push share this, so a token goes
 * stale (and is renewed) the same way in both.
 */
export async function accessTokenForAccount(
  account: StreamingAccount,
): Promise<AccountAccessToken> {
  const provider = PROVIDERS[account.platform];
  if (!provider) {
    throw new AppError(400, "That streaming account is not supported.");
  }
  const expiring =
    !account.expiresAt ||
    account.expiresAt.getTime() - Date.now() <= REFRESH_MARGIN_MS;
  if (!expiring || !account.refreshToken) {
    return { accessToken: openSecret(account.accessToken), refreshed: false };
  }

  const credentials = provider.credentials();
  if (!credentials) {
    throw new AppError(
      503,
      `${provider.label} OAuth is not configured on this server.`,
    );
  }
  const tokens = await requestTokens(provider, credentials, {
    grant_type: "refresh_token",
    refresh_token: openSecret(account.refreshToken),
  });
  const accessToken = requireAccessToken(tokens);
  account.accessToken = sealSecret(accessToken);
  if (typeof tokens.refresh_token === "string" && tokens.refresh_token) {
    account.refreshToken = sealSecret(tokens.refresh_token);
  }
  account.expiresAt = expiryFrom(tokens);
  await repository().update(
    { id: account.id },
    {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAt: account.expiresAt,
    },
  );
  return { accessToken, refreshed: true };
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
    if (!PROVIDERS[account.platform]) continue;
    try {
      const { refreshed: wasRefreshed } = await accessTokenForAccount(account);
      if (wasRefreshed) refreshed += 1;
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
      continue;
    }
    account.lastSyncedAt = new Date();
    await rows.update({ id: account.id }, { lastSyncedAt: account.lastSyncedAt });
  }

  return {
    connections: await listStreamingAccounts(userId),
    refreshed,
    disconnected,
    syncedAt: new Date().toISOString(),
  };
}

export interface FacebookPageDto {
  id: string;
  name: string;
  selected: boolean;
}

function pageDtos(
  pages: FacebookPage[],
  selectedId: string | null,
): FacebookPageDto[] {
  return pages.map((page) => ({
    id: page.id,
    name: page.name,
    selected: page.id === selectedId,
  }));
}

async function facebookAccount(userId: number): Promise<StreamingAccount> {
  const account = await repository().findOne({
    where: { userId, platform: "facebook" },
  });
  if (!account) {
    throw new AppError(409, "Connect Facebook before choosing a Page.");
  }
  return account;
}

/** The Pages a linked Facebook account can broadcast to. */
export async function listFacebookPages(
  userId: number | string,
): Promise<FacebookPageDto[]> {
  const account = await facebookAccount(Number(userId));
  const { accessToken } = await accessTokenForAccount(account);
  return pageDtos(await facebookPages(accessToken), account.pageId);
}

/**
 * Point the linked account at another Page it manages. The Page token is read
 * fresh from Graph rather than trusted from the request, so this cannot be used
 * to publish into a Page the grant does not own.
 */
export async function selectFacebookPage(
  userId: number | string,
  pageId: string,
): Promise<FacebookPageDto[]> {
  const account = await facebookAccount(Number(userId));
  const wanted = String(pageId || "").trim();
  const { accessToken } = await accessTokenForAccount(account);
  const pages = await facebookPages(accessToken);
  const page = pages.find((candidate) => candidate.id === wanted);
  if (!page) {
    throw new AppError(404, "That Page is not one this account manages.");
  }
  await repository().update(
    { id: account.id },
    {
      pageId: page.id,
      pageToken: sealSecret(page.token),
      displayName: page.name,
    },
  );
  return pageDtos(pages, page.id);
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
    if (provider.revoke) {
      await provider.revoke(token, credentials);
    } else if (key === "twitch" && credentials) {
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
