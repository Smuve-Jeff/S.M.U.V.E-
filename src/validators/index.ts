import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "@/lib";

const formatIssues = (error: z.ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

/**
 * Middleware factory: validates `req.body` against a Zod schema and replaces it
 * with the parsed output.
 */
export const validateBody =
  <T extends z.ZodType>(schema: T): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        new AppError(400, "Invalid request body", formatIssues(result.error)),
      );
    }
    req.body = result.data;
    next();
  };

// NOTE: zod v4 moved string-format validators to top-level schemas (z.email(),
// etc.), so the email check is applied with .pipe(z.email()) after transforms.
const emailField = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .max(100)
    .pipe(z.email("A valid email is required"));

// Mirrors the frontend strength policy (AuthService.validatePassword):
// 8+ chars with upper, lower, digit, and special — enforced server-side so
// API clients cannot bypass the UI's password rules.
const passwordField = () =>
  z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number")
    .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

export const authSchemas = {
  register: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Name must be at least 2 characters")
        .max(100),
      email: emailField(),
      password: passwordField(),
    })
    .strict(),

  login: z
    .object({
      email: emailField(),
      password: z.string().min(1, "Password is required").max(100),
    })
    .strict(),

  // Account recovery. The start request only ever echoes a generic message,
  // and redemption carries the single-use token plus the new credential, which
  // is held to the same strength policy as registration.
  forgotPassword: z
    .object({
      email: emailField(),
    })
    .strict(),

  verifyEmail: z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit verification code"),
    })
    .strict(),

  resetPassword: z
    .object({
      token: z
        .string()
        .trim()
        .min(20, "Reset token is required")
        .max(200, "Reset token is malformed"),
      password: passwordField(),
    })
    .strict(),
};

export const userSchemas = {
  update: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Name must be at least 2 characters")
        .max(100)
        .optional(),
      email: emailField().optional(),
      password: passwordField().optional(),
      // Proof of the *current* password. Required by the route for a
      // self-service password change; optional so an admin can still reset a
      // password they do not know.
      currentPassword: z.string().min(1).max(100).optional(),
      role: z.enum(["user", "admin"]).optional(),
    })
    // Strict: an update must name known fields only. Silently stripping extra
    // keys lets a client smuggle fields (e.g. `id`, `createdAt`) into the patch
    // and trusts the service layer to ignore them; refusing them outright keeps
    // the write surface exactly as wide as this schema.
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided",
    }),
};

export const productSchemas = {
  create: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Name must be at least 2 characters")
        .max(200),
      description: z.string().trim().max(5000).optional(),
      price: z.coerce
        .number()
        .positive("Price must be greater than 0")
        .max(1_000_000_000),
      stock: z.coerce
        .number()
        .int()
        .min(0)
        .max(1_000_000_000)
        .optional()
        .default(0),
      isActive: z.boolean().optional().default(true),
    })
    .strict(),

  update: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Name must be at least 2 characters")
        .max(200)
        .optional(),
      description: z.string().trim().max(5000).nullable().optional(),
      price: z.coerce
        .number()
        .positive("Price must be greater than 0")
        .max(1_000_000_000)
        .optional(),
      stock: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided",
    }),
};
