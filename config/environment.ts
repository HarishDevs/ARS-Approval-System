import "server-only";
import { z } from "zod";

// Validated once at first use so a missing value fails with a clear message
// instead of deep inside a request (P0-43). Anything only some features need
// (Firebase, job runner) is optional here, so one missing value can't take
// the whole app down — the Power BI site learned this the hard way on
// GoDaddy (2026-09-11). Provider keys are NOT env vars (see .env.example).
// A blank value ("KEY=") means "not set", as on GoDaddy's env editor.
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: optional(z.string().url()),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  FIREBASE_PROJECT_ID: optional(z.string().min(1)),
  FIREBASE_CLIENT_EMAIL: optional(z.string().min(1)),
  FIREBASE_PRIVATE_KEY: optional(z.string().min(1)),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().min(1),
  JOB_RUNNER_SECRET: optional(z.string().min(24)),
  // D-102: read by middleware.ts; listed here so a too-short value fails clearly.
  ORIGIN_SECRET: optional(z.string().min(24, "ORIGIN_SECRET must be at least 24 characters")),
  // Where request attachments are kept (D-072): outside the web root, on
  // GoDaddy's persistent disk. Defaults to ./storage/uploads.
  UPLOAD_DIR: optional(z.string().min(1)),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

// Tests replace process.env between cases.
export function resetEnvCacheForTests(): void {
  cachedEnv = undefined;
}
