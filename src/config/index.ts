import { NODE_ENV, PORT } from "./env";

/** General API config — primary values live in ./env. */
export const config = {
  env: NODE_ENV,
  port: PORT,
  apiUrl: process.env.API_URL || `http://localhost:${PORT}`,
};
