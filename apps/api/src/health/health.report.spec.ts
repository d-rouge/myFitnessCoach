import type { Env } from "@health-trainer/config";
import { describe, expect, it } from "vitest";
import { buildHealthReport } from "./health.report.js";

const baseEnv = {
  NODE_ENV: "test",
  API_PORT: 3000,
  WEB_ORIGIN: "http://localhost:5173",
  ENABLE_DEV_ENDPOINTS: true,
  ENABLE_LOCAL_AUTH: true,
  MONGODB_URI: "mongodb://127.0.0.1:27017/health_trainer",
  GOOGLE_ALLOWED_EMAILS: [],
  FEATURE_GARMIN: true,
  FEATURE_YAZIO: false,
  FEATURE_ZEPP: false,
  FEATURE_HEVY: false,
} as Env;

describe("buildHealthReport", () => {
  it("reports ok when Mongo is reachable", () => {
    const report = buildHealthReport({
      env: baseEnv,
      garminConfigured: false,
      mongo: { ok: true, latencyMs: 3 },
      uptimeSec: 10,
      version: "0.1.0",
      now: new Date("2026-10-26T10:00:00Z"),
    });

    expect(report.status).toBe("ok");
    expect(report.checks.mongo.status).toBe("ok");
    expect(report.checks.garmin.status).toBe("missing");
    expect(report.checks.googleAuth.status).toBe("missing");
  });

  it("degrades when Mongo is unreachable", () => {
    const report = buildHealthReport({
      env: baseEnv,
      garminConfigured: false,
      mongo: { ok: false, latencyMs: 1500, error: "ECONNREFUSED" },
      uptimeSec: 10,
      version: "0.1.0",
    });

    expect(report.status).toBe("degraded");
    expect(report.checks.mongo.error).toBe("ECONNREFUSED");
  });

  it("detects configured integrations", () => {
    const report = buildHealthReport({
      env: {
        ...baseEnv,
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        LLM_PROVIDER: "openai",
        LLM_API_KEY: "llm-key",
      },
      garminConfigured: true,
      mongo: { ok: true, latencyMs: 2 },
      uptimeSec: 10,
      version: "0.1.0",
    });

    expect(report.checks.garmin.status).toBe("configured");
    expect(report.checks.googleAuth.status).toBe("configured");
    expect(report.checks.llm.status).toBe("configured");
  });
});
