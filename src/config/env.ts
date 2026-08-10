export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = Number(process.env.PORT) || 4000;
export const DATABASE_URL = process.env.DATABASE_URL || "";
export const DB_NAME = process.env.DATABASE_URL?.split("/").pop() || "dbname";
export const JWT_SECRET = process.env.JWT_SECRET || "change-me";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
