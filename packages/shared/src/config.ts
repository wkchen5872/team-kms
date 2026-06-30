/**
 * Typed configuration loaded from the environment and validated with zod.
 *
 * `.env` loading uses Node 22's built-in `process.loadEnvFile` (no dotenv dep).
 * A single permissive schema serves all services; each service reads the
 * fields it needs. Only DATABASE_URL and SUPABASE_URL are always required.
 */
import { z } from "zod";

const ConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),

  CONVERTER_URL: z.string().url().optional(),
  CONVERTER_SECRET: z.string().optional(),

  API_URL: z.string().url().optional(),
  MCP_URL: z.string().url().optional(),
  APP_URL: z.string().url().optional(),
  API_PORT: z.coerce.number().int().default(8000),
  MCP_PORT: z.coerce.number().int().default(8001),
  CONVERTER_PORT: z.coerce.number().int().default(8002),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Validate the given record (defaults to process.env) into a typed Config. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return ConfigSchema.parse(env);
}

/**
 * Load `.env` into process.env (best-effort) then validate. Call once at a
 * service entrypoint. Missing `.env` is fine — the env may already be set.
 */
export function loadConfigFromEnvFile(path = ".env"): Config {
  try {
    process.loadEnvFile(path);
  } catch {
    // No .env file — rely on the ambient environment.
  }
  return loadConfig();
}
