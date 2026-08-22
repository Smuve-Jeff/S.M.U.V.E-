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
      role: z.enum(["user", "admin"]).optional(),
    })
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
