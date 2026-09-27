import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { AppDataSource } from "@/database/data-source";
import { AccountToken } from "@/entities/AccountToken";
import type { AccountTokenPurpose } from "@/entities/AccountToken";

const repo = () => AppDataSource.getRepository(AccountToken);

/** SHA-256 of the value that left the server; only this digest is stored. */
export const hashAccountToken = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/**
 * Constant-time digest comparison. Length-guarded because `timingSafeEqual`
 * throws on mismatched buffers, and case-exact because a case-insensitive
 * column collation (MySQL/Vitess) would otherwise accept a mutated digest.
 */
export const accountTokenDigestsMatch = (left: string, right: string): boolean => {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
};

/** A 256-bit URL-safe grant, for links that travel by email. */
export const generateAccountToken = (): string =>
  randomBytes(32).toString("base64url");

/**
 * A uniformly sampled 6-digit code.
 *
 * `randomInt` is the CSPRNG — `Math.random()` is seeded predictably enough that
 * an attacker who sees a few codes can anticipate the next one. The leading
 * zeros matter, so the value is padded rather than parsed as a number.
 */
export const generateVerificationCode = (): string =>
  String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Drop grants that can no longer be redeemed, so the table cannot grow. */
export const purgeStaleAccountTokens = async (): Promise<void> => {
  await repo()
    .createQueryBuilder("token")
    .delete()
    // Property paths, not raw column names: the driver quotes them correctly on
    // PostgreSQL and MySQL/Vitess alike.
    .where("token.expiresAt < :now OR token.usedAt IS NOT NULL", {
      now: new Date(),
    })
    .execute()
    .catch(() => undefined); // housekeeping must never fail the caller
};

/**
 * Issue the single live grant for (account, purpose), retiring any previous
 * one. Returns the raw value to email — never the stored digest.
 */
export const issueAccountToken = async (
  userId: number,
  purpose: AccountTokenPurpose,
  ttlMinutes: number,
  value: string = generateAccountToken(),
): Promise<string> => {
  await purgeStaleAccountTokens();
  // "Resend" must not leave an older, still-live credential in a mailbox.
  await repo().delete({ userId, purpose });
  await repo().save(
    repo().create({
      userId,
      purpose,
      tokenHash: hashAccountToken(value),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      usedAt: null,
      attempts: 0,
    }),
  );
  return value;
};

/** The live grant for an account + purpose, or null when there is none. */
export const findLiveAccountToken = async (
  userId: number,
  purpose: AccountTokenPurpose,
): Promise<AccountToken | null> => {
  const grant = await repo().findOne({ where: { userId, purpose } });
  if (!grant || grant.usedAt) return null;
  if (grant.expiresAt.getTime() <= Date.now()) return null;
  return grant;
};

/** Look a grant up by its digest — the only key an unauthenticated link has. */
export const findAccountTokenByDigest = async (
  purpose: AccountTokenPurpose,
  tokenHash: string,
): Promise<AccountToken | null> =>
  repo().findOne({ where: { purpose, tokenHash } });

/** Mark a grant used. */
export const burnAccountToken = async (grant: AccountToken): Promise<void> => {
  grant.usedAt = new Date();
  await repo().save(grant);
};

/**
 * Record a failed redemption against a grant. Returns true when the grant was
 * exhausted (and is now deleted, forcing a fresh code) so the caller can say so
 * instead of leaving a code that can still be guessed.
 */
export const recordFailedAccountTokenAttempt = async (
  grant: AccountToken,
  maxAttempts: number,
): Promise<boolean> => {
  grant.attempts = Number(grant.attempts ?? 0) + 1;
  if (grant.attempts >= maxAttempts) {
    await repo().delete({ id: grant.id });
    return true;
  }
  await repo().save(grant);
  return false;
};

/** Revoke grants — one purpose, or every outstanding grant for the account. */
export const revokeAccountTokens = async (
  userId: number,
  purpose?: AccountTokenPurpose,
): Promise<void> => {
  await repo()
    .delete(purpose ? { userId, purpose } : { userId })
    .catch(() => undefined);
};
