import { AppDataSource } from "@/database/data-source";
import { User } from "@/entities/User";
import { AppError } from "@/lib";
import type { PublicUser } from "@/types";
import {
  accountTokenDigestsMatch,
  burnAccountToken,
  findLiveAccountToken,
  generateVerificationCode,
  hashAccountToken,
  issueAccountToken,
  recordFailedAccountTokenAttempt,
  revokeAccountTokens,
} from "./account-token.service";
import {
  getEmailConfigurationIssue,
  renderEmailVerificationEmail,
  sendTransactionalEmail,
} from "./email.service";
import { toPublicUser } from "./user.service";

const PURPOSE = "email_verification" as const;
/** Short enough that a leaked mailbox code goes stale; long enough to type. */
const CODE_TTL_MINUTES = 15;
/** Guessing budget for a 6-digit code (1 in a million per attempt). */
const MAX_CONFIRM_ATTEMPTS = 5;

const userRepo = () => AppDataSource.getRepository(User);

/** Can this deployment actually deliver a verification code? */
export const isEmailVerificationAvailable = (): boolean =>
  getEmailConfigurationIssue() === "";

export interface VerificationSendResult {
  sent: boolean;
  message: string;
}

/**
 * Issue and email a fresh verification code for an account.
 *
 * Returns a result instead of throwing for the ordinary "we could not send
 * this" cases so the route can answer honestly without inventing an error the
 * client cannot act on.
 */
export const sendEmailVerificationCode = async (
  userId: number,
): Promise<VerificationSendResult> => {
  const issue = getEmailConfigurationIssue();
  if (issue) {
    return {
      sent: false,
      message: "Verification email is unavailable right now. Try again later.",
    };
  }

  const user = await userRepo().findOneBy({ id: userId });
  if (!user) throw new AppError(404, "User not found");
  if (user.emailVerified) {
    return { sent: false, message: "This address is already verified." };
  }

  // A short, typeable code (not a URL token): the entry point is the secure
  // channel prompt that already exists in the login surface and in Settings.
  const code = await issueAccountToken(
    userId,
    PURPOSE,
    CODE_TTL_MINUTES,
    generateVerificationCode(),
  );
  const { subject, html } = renderEmailVerificationEmail({
    name: user.name,
    code,
    expiresInMinutes: CODE_TTL_MINUTES,
  });
  await sendTransactionalEmail({ to: user.email, subject, html });

  return {
    sent: true,
    message: `A verification code is on its way to ${user.email}.`,
  };
};

/**
 * Confirm a code and mark the address verified.
 *
 * The code is single-use, expires, and has a fixed guessing budget — the
 * account is only ever flagged verified by this path, never by signing in.
 */
export const confirmEmailVerification = async (
  userId: number,
  code: string,
): Promise<PublicUser> => {
  const user = await userRepo().findOneBy({ id: userId });
  if (!user) throw new AppError(404, "User not found");
  if (user.emailVerified) return toPublicUser(user);

  const grant = await findLiveAccountToken(userId, PURPOSE);
  if (!grant) {
    throw new AppError(
      400,
      "No verification code is pending for this account. Request a new one.",
    );
  }

  const digest = hashAccountToken(code.trim());
  if (!accountTokenDigestsMatch(grant.tokenHash, digest)) {
    const exhausted = await recordFailedAccountTokenAttempt(
      grant,
      MAX_CONFIRM_ATTEMPTS,
    );
    if (exhausted) {
      throw new AppError(
        429,
        "Too many incorrect codes. Request a new one to continue.",
      );
    }
    throw new AppError(400, "That verification code is not correct.");
  }

  user.emailVerified = true;
  await userRepo().save(user);
  await burnAccountToken(grant);

  return toPublicUser(user);
};

/** Drop any pending verification grant (account deleted, address changed). */
export const revokeEmailVerificationTokens = async (
  userId: number,
): Promise<void> => revokeAccountTokens(userId, PURPOSE);
