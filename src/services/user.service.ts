import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@/config/env";
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
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const signToken = (user: User): string =>
  jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });

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

  return { token: signToken(user), user: toPublicUser(user) };
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

  return { token: signToken(user), user: toPublicUser(user) };
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
  if (patch.email !== undefined) user.email = patch.email;
  if (patch.role !== undefined) user.role = patch.role;
  if (patch.password !== undefined) {
    user.password = await bcrypt.hash(patch.password, 10);
  }

  const updated = await repo().save(user);
  return toPublicUser(updated);
};

export const deleteUser = async (id: number): Promise<void> => {
  const result = await repo().delete({ id });
  if (!result.affected) throw new AppError(404, "User not found");
};
