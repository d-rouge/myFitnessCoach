import type { Env } from "@health-trainer/config";
import type { MongoPingResult } from "@health-trainer/db";

export type CheckStatus = "ok" | "error" | "configured" | "missing" | "unchecked";

export interface HealthReport {
  status: "ok" | "degraded";
  version: string;
  timestamp: string;
  uptimeSec: number;
  checks: {
    mongo: {
      status: CheckStatus;
      latencyMs?: number;
      error?: string;
    };
    garmin: {
      status: CheckStatus;
    };
    googleAuth: {
      status: CheckStatus;
    };
    llm: {
      status: CheckStatus;
      provider?: string;
      model?: string | null;
    };
  };
}

export interface HealthReportInput {
  env: Env;
  mongo: MongoPingResult;
  /** Resolved by GarminService, which also accepts the local secrets file. */
  garminConfigured: boolean;
  uptimeSec: number;
  version: string;
  now?: Date;
}

export function buildHealthReport(input: HealthReportInput): HealthReport {
  const { env, mongo } = input;

  const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID);
  const llmConfigured = Boolean(env.LLM_PROVIDER && env.LLM_API_KEY);

  const status = mongo.ok ? "ok" : "degraded";

  return {
    status,
    version: input.version,
    timestamp: (input.now ?? new Date()).toISOString(),
    uptimeSec: input.uptimeSec,
    checks: {
      mongo: {
        status: mongo.ok ? "ok" : "error",
        latencyMs: mongo.latencyMs,
        error: mongo.error,
      },
      garmin: {
        status: input.garminConfigured ? "configured" : "missing",
      },
      googleAuth: {
        status: googleConfigured ? "configured" : "missing",
      },
      llm: {
        status: llmConfigured ? "configured" : "missing",
        provider: env.LLM_PROVIDER,
        // Modello usato dal coach; quello di pianificazione è `LLM_MODEL`.
        model: llmConfigured ? (env.LLM_MODEL_FAST ?? env.LLM_MODEL ?? null) : null,
      },
    },
  };
}
