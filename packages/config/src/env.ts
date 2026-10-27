import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const booleanWithDefault = (defaultValue: "true" | "false") =>
  z
    .preprocess(
      (value) => (value === undefined || value === "" ? defaultValue : value),
      z.enum(["true", "false", "1", "0"]),
    )
    .transform((value) => value === "true" || value === "1");

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(3000)),
    WEB_ORIGIN: z.string().default("http://localhost:5173"),
    ENABLE_DEV_ENDPOINTS: booleanWithDefault("false"),

    MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/health_trainer"),

    JWT_SECRET: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GOOGLE_ALLOWED_EMAILS: z
      .preprocess(emptyToUndefined, z.string().optional())
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((email) => email.trim().toLowerCase())
              .filter(Boolean)
          : [],
      ),

    GARMIN_PERSONAL_API_KEY: optionalString,
    YAZIO_EMAIL: optionalString,
    YAZIO_PASSWORD: optionalString,
    YAZIO_BASE_URL: optionalString,
    YAZIO_CLIENT_ID: optionalString,
    YAZIO_CLIENT_SECRET: optionalString,
    YAZIO_REFRESH_TOKEN: optionalString,
    YAZIO_ACCESS_TOKEN: optionalString,
    YAZIO_TOKEN_EXPIRES_AT: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
    YAZIO_USER_AGENT: optionalString,
    ZEPP_APP_TOKEN: optionalString,
    ZEPP_USER_ID: optionalString,
    ZEPP_HOST: optionalString,
    HEVY_API_KEY: optionalString,

    LLM_PROVIDER: z.preprocess(
      emptyToUndefined,
      z.enum(["openai", "anthropic", "google", "openrouter", "ollama"]).optional(),
    ),
    LLM_API_KEY: optionalString,
    LLM_MODEL: optionalString,

    FEATURE_GARMIN: booleanWithDefault("true"),
    FEATURE_YAZIO: booleanWithDefault("false"),
    FEATURE_ZEPP: booleanWithDefault("false"),
    FEATURE_HEVY: booleanWithDefault("false"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "test") {
      if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: "custom",
          path: ["JWT_SECRET"],
          message: "JWT_SECRET is required and must be at least 32 characters",
        });
      }
    }

    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_ALLOWED_EMAILS.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_ALLOWED_EMAILS"],
        message: "GOOGLE_ALLOWED_EMAILS is required when GOOGLE_CLIENT_ID is configured",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}
