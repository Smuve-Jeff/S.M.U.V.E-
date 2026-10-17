import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@/config/env";
import { isEmailConfigured } from "./email.service";
import { AppDataSource } from "@/database/data-source";
import { User } from "@/entities/User";
import { AppError } from "@/lib";
import type { AuthResponse, PublicUser } from "@/types";

const repo = () => AppDataSource.getRepository(User);

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: Boolean(user.emailVerified),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

/**
 * Mint a session token.
 *
 * `tv` carries the account's tokenVersion so `authenticate` can tell a live
 * token from one issued before a credential rotation, and the algorithm is
 * pinned at signing time to match the pin at verification time.
 */
const signToken = (user: User): string =>
  jwt.sign(
    { userId: user.id, role: user.role, tv: Number(user.tokenVersion ?? 0) },
    JWT_SECRET,
    { expiresIn: "7d", algorithm: "HS256" },
  );

/** Whether this deployment can deliver verification mail (surfaced to the UI). */
const verificationAvailable = (): boolean => isEmailConfigured();

/** Create an account with a bcrypt-hashed password and return a JWT. */
export const registerUser = async (input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> => {
  const existing = await repo().findOneBy({ email: input.email });
  if (existing) {
    throw new AppError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await repo().save(
    repo().create({
      name: input.name,
      email: input.email,
      password: passwordHash,
    }),
  );

  return {
    token: signToken(user),
    user: toPublicUser(user),
    emailVerificationAvailable: verificationAvailable(),
  };
};

/** Verify credentials and return a JWT. */
export const loginUser = async (input: {
  email: string;
  password: string;
}): Promise<AuthResponse> => {
  const user = await repo()
    .createQueryBuilder("user")
    .addSelect("user.password")
    .where("user.email = :email", { email: input.email })
    .getOne();

  if (!user || !(await bcrypt.compare(input.password, user.password))) {
    throw new AppError(401, "Invalid email or password");
  }

  return {
    token: signToken(user),
    user: toPublicUser(user),
    emailVerificationAvailable: verificationAvailable(),
  };
};

/**
 * Mint a fresh token for an account.
 *
 * Used after a credential rotation: revoking every session necessarily kills
 * the caller's own token too, so the request that changed the password hands
 * back a replacement rather than logging the owner out of their own device.
 */
export const issueAuthToken = async (id: number): Promise<string | null> => {
  const user = await repo().findOneBy({ id });
  return user ? signToken(user) : null;
};

export const getUserById = async (id: number): Promise<PublicUser> => {
  const user = await repo().findOneBy({ id });
  if (!user) throw new AppError(404, "User not found");
  return toPublicUser(user);
};

export const listUsers = async (): Promise<PublicUser[]> => {
  const users = await repo().find({ order: { createdAt: "DESC" } });
  return users.map(toPublicUser);
};

export const updateUser = async (
  id: number,
  patch: {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  },
): Promise<PublicUser> => {
  const user = await repo().findOneBy({ id });
  if (!user) throw new AppError(404, "User not found");

  if (patch.email !== undefined && patch.email !== user.email) {
    const existing = await repo().findOneBy({ email: patch.email });
    if (existing) throw new AppError(409, "An account with this email already exists");
  }

  if (patch.name !== undefined) user.name = patch.name;
  if (patch.email !== undefined) {
    if (patch.email !== user.email) {
      // A new address has never been confirmed — carrying the old "verified"
      // flag onto it would be a lie the UI then acts on.
      user.emailVerified = false;
    }
    user.email = patch.email;
  }
  if (patch.role !== undefined) user.role = patch.role;
  if (patch.password !== undefined) {
    user.password = await bcrypt.hash(patch.password, 10);
    // Rotating the credential revokes every session that was opened with the
    // old one: the tokens already in the wild carry the previous version.
    user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
  }

  const updated = await repo().save(user);
  return toPublicUser(updated);
};

/**
 * Compare a candidate password against the stored hash for `id`.
 *
 * Used to require proof of the current credential before a self-service
 * password change: without it, anyone holding a live session (stolen token,
 * unlocked device) could lock the real owner out by writing a new password.
 */
export const verifyUserPassword = async (
  id: number,
  candidate: string,
): Promise<boolean> => {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const user = await repo().findOneBy({ id });
  if (!user || !user.password) return false;
  return bcrypt.compare(candidate, user.password);
};

export const deleteUser = async (id: number): Promise<void> => {
  const result = await repo().delete({ id });
  if (!result.affected) throw new AppError(404, "User not found");
};
