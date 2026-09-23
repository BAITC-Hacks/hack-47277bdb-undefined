import { z } from "zod";

const booleanFromString = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATA_SOURCE: z.enum(["mock", "live"]).default("mock"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  DATABASE_URL: z.string().url().optional(),
  EKT_CATALOG_API_URL: z.string().url().optional(),
  EKT_CATALOG_API_KEY: z.string().min(1).optional(),
  EKT_CART_API_URL: z.string().url().optional(),
  EKT_SITE_URL: z.string().url().default("https://ekt.kz"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  SESSION_SIGNING_SECRET: z.string().min(32).default("development-only-secret-must-be-replaced"),
  CART_PROPOSAL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(100),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  ENABLE_SSE: booleanFromString.optional().default(true)
});

export type AppConfig = z.infer<typeof envSchema> & {
  readonly corsOrigins: readonly string[];
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(source);
  return {
    ...parsed,
    corsOrigins: parsed.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
  };
}
