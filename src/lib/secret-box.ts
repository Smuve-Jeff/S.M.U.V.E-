import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { JWT_SECRET, OAUTH_TOKEN_KEY } from "@/config/env";

/**
 * Sealing for OAuth grants at rest.
 *
 * AES-256-GCM with a random IV per value: a database dump on its own cannot be
 * replayed into a host's channel, and tampering with a stored token fails the
 * auth tag instead of decrypting into garbage that gets sent to the provider.
 *
 * The key comes from `OAUTH_TOKEN_KEY` when set. Otherwise it is derived from
 * `JWT_SECRET` under a distinct label, so production still has no committed
 * key material; rotating `JWT_SECRET` then requires reconnecting accounts,
 * which is the honest outcome of rotating a secret that protects them.
 */
const VERSION = "v1";

/** Decode an operator key: 64 hex characters or base64 that yields 32 bytes. */
export function decodeOAuthTokenKey(value: string): Buffer | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const decoded = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  return decoded.length === 32 ? decoded : null;
}

function key(): Buffer {
  const configured = OAUTH_TOKEN_KEY.trim();
  if (configured) {
    // A value that is not a 32-byte key still has to seal deterministically:
    // hash it, and let the deploy check warn that the operator's key is off.
    return (
      decodeOAuthTokenKey(configured) ??
      createHash("sha256").update(configured).digest()
    );
  }
  return createHash("sha256").update(`smuve:stream-oauth:${JWT_SECRET}`).digest();
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, body] = (sealed ?? "").split(".");
  if (version !== VERSION || !iv || !tag || !body) {
    throw new Error("Stored token is not readable.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
