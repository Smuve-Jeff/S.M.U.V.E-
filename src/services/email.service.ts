import {
  NODE_ENV,
  PLUNK_API_KEY,
  PLUNK_FROM_EMAIL,
  PLUNK_FROM_NAME,
} from "@/config/env";

/**
 * Plunk's transactional send endpoint.
 *
 * Note the host: Plunk's current API base is `next-api.useplunk.com` (the
 * legacy `api.useplunk.com` host is not the documented one any more), and
 * `/v1/send` authenticates with the project's *secret* key only.
 */
const PLUNK_SEND_URL = "https://next-api.useplunk.com/v1/send";

export interface TransactionalEmail {
  to: string;
  subject: string;
  /** HTML body. Plunk derives the plain-text alternative itself. */
  html: string;
}

/** Raised when an email could not be handed to Plunk. */
export class EmailDeliveryError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 502, code = "EMAIL_DELIVERY_FAILED") {
    super(message);
    this.name = "EmailDeliveryError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Why transactional email cannot be used right now, or "" when it can.
 *
 * Both a secret key and a verified sending address are required, so a
 * deployment missing either can report recovery as unavailable instead of
 * accepting a request and silently dropping the mail.
 */
export const getEmailConfigurationIssue = (): string => {
  if (!PLUNK_API_KEY) return "PLUNK_API_KEY is not set";
  // A public key can never send; report it as misconfigured rather than
  // failing one request at a time.
  if (PLUNK_API_KEY.startsWith("pk_")) {
    return "PLUNK_API_KEY is a public key (pk_*), which Plunk accepts only on /v1/track — use the project secret key (sk_*)";
  }
  if (!PLUNK_FROM_EMAIL) {
    return "PLUNK_FROM_EMAIL is not set (verify a sending domain in Plunk)";
  }
  return "";
};

/** Is transactional email usable at all? */
export const isEmailConfigured = (): boolean =>
  getEmailConfigurationIssue() === "";

/**
 * Log — once, at boot — whether account-recovery email can be delivered.
 * Misconfiguration is otherwise invisible until an artist needs a reset link.
 */
export const logEmailConfiguration = (): void => {
  const issue = getEmailConfigurationIssue();
  if (issue) {
    console.warn(`[email] password-reset email disabled — ${issue}.`);
    return;
  }
  console.log(
    `[email] Plunk transactional email enabled (from ${PLUNK_FROM_EMAIL}).`,
  );
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Send one transactional email through Plunk.
 *
 * `subscribed` is deliberately not sent: on /v1/send it defaults to `false`
 * for new contacts and, when supplied for an existing contact, *changes*
 * their subscription state. Account-recovery mail must never mutate the
 * artist's marketing preferences.
 */
export const sendTransactionalEmail = async (
  email: TransactionalEmail,
): Promise<void> => {
  if (!PLUNK_API_KEY) {
    throw new EmailDeliveryError(
      "Email is unavailable: PLUNK_API_KEY is not configured.",
      503,
      "EMAIL_NOT_CONFIGURED",
    );
  }
  if (PLUNK_API_KEY.startsWith("pk_")) {
    throw new EmailDeliveryError(
      "Email is unavailable: PLUNK_API_KEY is a public (pk_*) key, which Plunk only accepts on /v1/track. Use the project secret key (sk_*).",
      503,
      "EMAIL_KEY_INVALID",
    );
  }
  if (!PLUNK_FROM_EMAIL) {
    throw new EmailDeliveryError(
      "Email is unavailable: PLUNK_FROM_EMAIL is not configured. Verify a sending domain in Plunk first.",
      503,
      "EMAIL_NOT_CONFIGURED",
    );
  }

  let response: Response;
  try {
    response = await fetch(PLUNK_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PLUNK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: email.to,
        subject: email.subject,
        body: email.html,
        from: { name: PLUNK_FROM_NAME, email: PLUNK_FROM_EMAIL },
      }),
    });
  } catch (err) {
    throw new EmailDeliveryError(
      `Plunk is unreachable: ${err instanceof Error ? err.message : String(err)}`,
      502,
      "EMAIL_UNREACHABLE",
    );
  }

  const payload = (await response.json().catch(() => undefined)) as
    | { success?: boolean; error?: { code?: string; message?: string } }
    | undefined;

  if (!response.ok || payload?.success === false) {
    const code = payload?.error?.code || `HTTP_${response.status}`;
    const detail = payload?.error?.message || response.statusText;
    // Log the failure code only. Never log the API key, the recipient, or the
    // body: a reset link inside it is a live bearer credential.
    console.error(`[email] Plunk send failed (${code}): ${detail}`);
    throw new EmailDeliveryError(`Email delivery failed (${code}).`, 502, code);
  }

  if (NODE_ENV !== "production") {
    console.log(`[email] Plunk accepted a "${email.subject}" message.`);
  }
};

export interface EmailVerificationEmailInput {
  /** Artist display name — escaped before it reaches the HTML body. */
  name: string;
  code: string;
  expiresInMinutes: number;
}

/** Render the address-verification message (single-use 6-digit code). */
export const renderEmailVerificationEmail = ({
  name,
  code,
  expiresInMinutes,
}: EmailVerificationEmailInput): { subject: string; html: string } => {
  const safeName = escapeHtml(name || "artist");
  const safeCode = escapeHtml(code);

  return {
    subject: "Confirm your S.M.U.V.E. 2.0 secure channel",
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#020617;color:#f1f5ff;font-family:'Helvetica Neue',Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:32px;background:#0f172a">
      <p style="margin:0 0 24px;font-size:12px;letter-spacing:0.35em;text-transform:uppercase;color:#10b981">
        S.M.U.V.E. 2.0
      </p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff">
        Confirm your secure channel
      </h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#c7d2fe">
        ${safeName}, enter this code to verify the address on your account. It
        works once and expires in ${expiresInMinutes} minutes.
      </p>
      <p style="margin:24px 0;padding:18px 0;border-radius:16px;background:#020617;border:1px solid rgba(16,185,129,0.35);text-align:center;font-size:32px;letter-spacing:0.35em;font-weight:700;color:#10b981">
        ${safeCode}
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8">
        Did not create this account? Ignore this message — the address stays
        unverified and nothing is shared with it.
      </p>
    </div>
  </body>
</html>`,
  };
};

export interface PasswordResetEmailInput {
  /** Artist display name — escaped before it reaches the HTML body. */
  name: string;
  link: string;
  expiresInMinutes: number;
}

/** Render the password-reset message. */
export const renderPasswordResetEmail = ({
  name,
  link,
  expiresInMinutes,
}: PasswordResetEmailInput): { subject: string; html: string } => {
  const safeName = escapeHtml(name || "artist");
  const safeLink = escapeHtml(link);

  return {
    subject: "Reset your S.M.U.V.E. 2.0 access cipher",
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#020617;color:#f1f5ff;font-family:'Helvetica Neue',Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:32px;background:#0f172a">
      <p style="margin:0 0 24px;font-size:12px;letter-spacing:0.35em;text-transform:uppercase;color:#10b981">
        S.M.U.V.E. 2.0
      </p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff">
        Access cipher reset requested
      </h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#c7d2fe">
        ${safeName}, a reset link was requested for your account. Choosing a new
        access cipher will invalidate this link — it works once, for the next
        ${expiresInMinutes} minutes.
      </p>
      <p style="margin:24px 0">
        <a href="${safeLink}" style="display:inline-block;padding:16px 28px;border-radius:16px;background:#10b981;color:#020617;font-size:13px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none">
          Set a new cipher
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#94a3b8">
        If the button does not open, paste this address into your browser:
      </p>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all">
        <a href="${safeLink}" style="color:#38bdf8">${safeLink}</a>
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8">
        Did not request this? Ignore this message — nothing changes until the
        link above is used.
      </p>
    </div>
  </body>
</html>`,
  };
};
