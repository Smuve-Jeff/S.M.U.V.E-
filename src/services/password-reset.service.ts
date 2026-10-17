import bcrypt from "bcryptjs";
import { APP_ORIGIN, PASSWORD_RESET_TTL_MINUTES } from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import { User } from "@/entities/User";
import { AppError } from "@/lib";
import type { PublicUser } from "@/types";
import {
  accountTokenDigestsMatch,
  burnAccountToken,
  findAccountTokenByDigest,
  hashAccountToken,
  issueAccountToken,
  revokeAccountTokens,
} from "./account-token.service";
import { renderPasswordResetEmail, sendTransactionalEmail } from "./email.service";
import { toPublicUser } from "./user.service";

const PURPOSE = "password_reset" as const;
const userRepo = () => AppDataSource.getRepository(User);

/** Where the emailed link lands — the Angular recovery screen. */
export const buildPasswordResetLink = (token: string): string =>
  `${APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;

/** Create a single-use grant for an account, retiring any previous one. */
export const issuePasswordResetToken = async (userId: number): Promise<string> =>
  issueAccountToken(userId, PURPOSE, PASSWORD_RESET_TTL_MINUTES);

/**
 * Start a password reset.
 *
 * Returns `false` for an unknown address *and* swallows delivery failures, so
 * the caller can answer every request identically: a differing response (or
 * status) would turn this endpoint into an account-existence oracle. The
 * caller is responsible for logging the failure.
 */
export const requestPasswordReset = async (email: string): Promise<boolean> => {
  const user = await userRepo().findOneBy({ email });
  if (!user) return false;

  const token = await issuePasswordResetToken(user.id);
  const { subject, html } = renderPasswordResetEmail({
    name: user.name,
    link: buildPasswordResetLink(token),
    expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
  });

  await sendTransactionalEmail({ to: user.email, subject, html });
  return true;
};

/**
 * Redeem a reset link: verify the digest, burn the grant, and write the new
 * password hash.
 *
 * The grant is single-use and time-boxed, and the new credential bumps
 * `tokenVersion` — the whole point of a reset is to end the attacker's access,
 * which a stateless JWT cannot do on its own.
 */
export const resetPasswordWithToken = async (
  token: string,
  newPassword: string,
): Promise<PublicUser> => {
  // Deliberately one shared message: distinguishing "expired" from "unknown"
  // tells an attacker which of their guesses was ever real.
  const invalid = new AppError(
    400,
    "This reset link is invalid, expired, or has already been used. Request a new one.",
  );

  const candidateHash = hashAccountToken(token);
  const grant = await findAccountTokenByDigest(PURPOSE, candidateHash);
  if (!grant) throw invalid;
  if (!accountTokenDigestsMatch(grant.tokenHash, candidateHash)) throw invalid;
  if (grant.usedAt || grant.expiresAt.getTime() <= Date.now()) throw invalid;

  const user = await userRepo().findOneBy({ id: grant.userId });
  if (!user) throw invalid;

  user.password = await bcrypt.hash(newPassword, 10);
  user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
  await userRepo().save(user);

  await burnAccountToken(grant);
  // Burn every other outstanding grant for the account: the reset is done, so
  // nothing else should be redeemable.
  await revokeAccountTokens(user.id, PURPOSE);

  return toPublicUser(user);
};

/** Revoke outstanding resets — used when a password changes by another path. */
export const revokePasswordResetTokens = async (userId: number): Promise<void> =>
  revokeAccountTokens(userId, PURPOSE);
