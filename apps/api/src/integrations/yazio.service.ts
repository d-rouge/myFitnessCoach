import { readFileSync } from "node:fs";
import type { Env } from "@health-trainer/config";
import { YazioClient, type YazioCredentials } from "@health-trainer/integrations";
import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { APP_ENV } from "../config/env.module.js";

export interface YazioCheckResult {
  configured: boolean;
  ok: boolean;
  latencyMs: number;
  baseUrl?: string;
  error?: string;
}

@Injectable()
export class YazioService {
  private client?: YazioClient;

  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  isConfigured(): boolean {
    return Boolean(this.resolveCredentials());
  }

  getClient(): YazioClient {
    if (this.client) return this.client;

    const credentials = this.resolveCredentials();
    if (!credentials) {
      throw new ServiceUnavailableException("Yazio credentials are not configured");
    }

    this.client = new YazioClient({
      credentials,
      baseUrl: this.env.YAZIO_BASE_URL,
      clientId: this.env.YAZIO_CLIENT_ID,
      clientSecret: this.env.YAZIO_CLIENT_SECRET,
      timeoutMs: 25_000,
    });
    return this.client;
  }

  async check(): Promise<YazioCheckResult> {
    if (!this.resolveCredentials()) {
      return {
        configured: false,
        ok: false,
        latencyMs: 0,
        error: "Yazio credentials are not configured",
      };
    }

    const health = await this.getClient().healthCheck();

    return {
      configured: true,
      ok: health.ok,
      latencyMs: health.latencyMs,
      baseUrl: health.baseUrl,
      error: health.error,
    };
  }

  /**
   * Dev convenience: secrets/yazio.json is ignored by git.
   * In production credentials must come from env/secret manager.
   */
  private resolveCredentials(): YazioCredentials | undefined {
    if (this.env.YAZIO_EMAIL && this.env.YAZIO_PASSWORD) {
      return { email: this.env.YAZIO_EMAIL, password: this.env.YAZIO_PASSWORD };
    }

    if (this.env.NODE_ENV === "production") {
      return undefined;
    }

    try {
      const raw = readFileSync(new URL("../../../../secrets/yazio.json", import.meta.url), "utf8");
      const parsed = JSON.parse(raw) as {
        email?: unknown;
        username?: unknown;
        password?: unknown;
      };
      const email =
        typeof parsed.email === "string"
          ? parsed.email
          : typeof parsed.username === "string"
            ? parsed.username
            : undefined;
      const password = typeof parsed.password === "string" ? parsed.password : undefined;

      return email && password ? { email, password } : undefined;
    } catch {
      return undefined;
    }
  }
}
