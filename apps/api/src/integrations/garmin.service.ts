import type { Env } from "@health-trainer/config";
import { GarminPersonalClient } from "@health-trainer/integrations";
import { Inject, Injectable } from "@nestjs/common";
import { APP_ENV } from "../config/env.module.js";

export interface GarminCheckResult {
  configured: boolean;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

@Injectable()
export class GarminService {
  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  isConfigured(): boolean {
    return Boolean(this.env.GARMIN_PERSONAL_API_KEY);
  }

  async check(): Promise<GarminCheckResult> {
    if (!this.env.GARMIN_PERSONAL_API_KEY) {
      return {
        configured: false,
        ok: false,
        latencyMs: 0,
        error: "GARMIN_PERSONAL_API_KEY is not configured",
      };
    }

    const client = new GarminPersonalClient({
      apiKey: this.env.GARMIN_PERSONAL_API_KEY,
      timeoutMs: 15_000,
    });

    const health = await client.healthCheck();

    return {
      configured: true,
      ok: health.ok,
      latencyMs: health.latencyMs,
      error: health.error,
    };
  }
}
