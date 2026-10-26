import { readFileSync } from "node:fs";
import type { Env } from "@health-trainer/config";
import { GarminPersonalClient } from "@health-trainer/integrations";
import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
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
    return Boolean(this.resolveApiKey());
  }

  getClient(): GarminPersonalClient {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException("GARMIN_PERSONAL_API_KEY is not configured");
    }

    return new GarminPersonalClient({
      apiKey,
      timeoutMs: 20_000,
    });
  }

  async check(): Promise<GarminCheckResult> {
    if (!this.resolveApiKey()) {
      return {
        configured: false,
        ok: false,
        latencyMs: 0,
        error: "GARMIN_PERSONAL_API_KEY is not configured",
      };
    }

    const health = await this.getClient().healthCheck();

    return {
      configured: true,
      ok: health.ok,
      latencyMs: health.latencyMs,
      error: health.error,
    };
  }

  /**
   * Dev convenience: the local key file is ignored by git.
   * In production the key must come from env/secret manager.
   */
  private resolveApiKey(): string | undefined {
    if (this.env.GARMIN_PERSONAL_API_KEY) {
      return this.env.GARMIN_PERSONAL_API_KEY;
    }

    if (this.env.NODE_ENV === "production") {
      return undefined;
    }

    try {
      const key = readFileSync(
        new URL("../../../../secrets/garmin-key.txt", import.meta.url),
        "utf8",
      ).trim();
      return key || undefined;
    } catch {
      return undefined;
    }
  }
}
