/**
 * Payload budget shared by the API and the web client.
 *
 * When object storage is unavailable the Profile editor can keep an artist's
 * avatar/header on the device as a data URL, and the whole profile — images
 * included — is then posted as a single JSON body. Express's default parser
 * cap is 100 kb, so a device-local image would have failed the *profile save*
 * rather than the upload.
 *
 * Both numbers therefore have to be chosen together, and they live in one
 * module so they cannot drift apart. `payload-limits.spec.ts` holds the
 * invariant, and measures it against a real body-parser round trip.
 */

/** Body-parser cap for the profile payload (see the mount in `src/app.ts`). */
export const PROFILE_JSON_LIMIT = "8mb";
export const PROFILE_JSON_LIMIT_BYTES = 8 * 1024 * 1024;

/**
 * Largest device-local image data URL kept per profile field, in characters
 * (a data URL is a string, so character length is exactly what lands in the
 * JSON body). Anything bigger is refused with an actionable message instead of
 * silently making the profile unsaveable.
 */
export const LOCAL_IMAGE_MAX_BYTES = {
  avatarImage: 512 * 1024,
  headerImage: 2 * 1024 * 1024,
} as const;

export type LocalImageField = keyof typeof LOCAL_IMAGE_MAX_BYTES;

/** Longest edge a device-local image is downscaled to before it is stored. */
export const LOCAL_IMAGE_MAX_EDGE = {
  avatarImage: 512,
  headerImage: 1600,
} as const;

/**
 * Left over for everything else in the profile: journey, blueprint, catalogue,
 * artist DNA, identity state. Measured generously rather than tightly, because
 * refusing a legitimate profile is worse than carrying spare headroom.
 */
export const PROFILE_JSON_RESERVE_BYTES = 1024 * 1024;

/**
 * Worst case the client can produce: both images at their cap, plus the
 * reserve for the rest of the profile. Kept comfortably below
 * {@link PROFILE_JSON_LIMIT_BYTES}.
 */
export const PROFILE_PAYLOAD_WORST_CASE_BYTES =
  LOCAL_IMAGE_MAX_BYTES.avatarImage +
  LOCAL_IMAGE_MAX_BYTES.headerImage +
  PROFILE_JSON_RESERVE_BYTES;

/** Human copy for the refusal message, so the artist is told the real limit. */
export const localImageLimitKilobytes = (field: LocalImageField): number =>
  Math.round(LOCAL_IMAGE_MAX_BYTES[field] / 1024);
