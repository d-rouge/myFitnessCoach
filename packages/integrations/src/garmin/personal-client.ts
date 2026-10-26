import { z } from "zod";
import {
  AuthExpiredError,
  InvalidResponseError,
  ProviderError,
  ProviderUnavailableError,
  RateLimitedError,
} from "../errors";

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().positive().optional(),
});

export interface GarminToken {
  accessToken: string;
  expiresAt: number;
}

export interface GarminPersonalClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export interface GarminActivitySearchParams {
  start?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  activityType?: string;
}

export interface GarminHealthCheck {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export type GarminJson = Record<string, unknown> | unknown[] | string | number | boolean | null;

const DEFAULT_BASE_URL = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export class GarminPersonalClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  private token?: GarminToken;

  constructor(options: GarminPersonalClientOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("Garmin personal API key is required");
    }

    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async getAccessToken(force = false): Promise<GarminToken> {
    if (!force && this.token && this.token.expiresAt > this.now() + TOKEN_REFRESH_WINDOW_MS) {
      return this.token;
    }

    // Garmin is strict: sending Accept: application/json on the token endpoint
    // returns 406 and the token is returned as a raw JWT, not JSON.
    const response = await this.request(`${this.baseUrl}${TOKEN_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw await this.toError(response, "token");
    }

    const raw = (await response.text()).trim();
    if (!raw) {
      throw new InvalidResponseError("garmin", "Garmin returned an empty token response");
    }

    let accessToken: string | undefined;
    let expiresIn: number | undefined;

    if (raw.startsWith("{")) {
      try {
        const parsed = TokenResponseSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          accessToken = parsed.data.access_token;
          expiresIn = parsed.data.expires_in;
        }
      } catch {
        // Fall through to raw JWT handling.
      }
    }

    if (!accessToken && raw.split(".").length === 3) {
      accessToken = raw;
    }

    if (!accessToken) {
      throw new InvalidResponseError("garmin", "Garmin returned an invalid token response");
    }

    const expiresAt = expiresIn
      ? this.now() + expiresIn * 1000
      : (decodeJwtExpiry(accessToken) ?? this.now() + 23 * 60 * 60 * 1000);

    this.token = { accessToken, expiresAt };
    return this.token;
  }

  async getProfileSettings(): Promise<GarminJson> {
    return this.get("/userprofile-service/userprofile/settings");
  }

  async searchActivities(params: GarminActivitySearchParams = {}): Promise<GarminJson> {
    return this.get("/activitylist-service/activities/search/activities", {
      start: params.start ?? 0,
      limit: params.limit ?? 20,
      startDate: params.startDate,
      endDate: params.endDate,
      activityType: params.activityType,
    });
  }

  async getActivity(activityId: number | string): Promise<GarminJson> {
    return this.get(`/activity-service/activity/${activityId}`);
  }

  async downloadActivity(activityId: number | string): Promise<ArrayBuffer> {
    const token = await this.getAccessToken();
    const response = await this.request(
      this.buildUrl(`/download-service/files/activity/${activityId}`),
      {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw await this.toError(response, "activity-download");
    }

    return response.arrayBuffer();
  }

  async getDailySleep(date: string): Promise<GarminJson> {
    return this.get("/sleep-service/sleep/dailySleep", { date });
  }

  async getHrv(date: string): Promise<GarminJson> {
    return this.get(`/hrv-service/hrv/${date}`);
  }

  async getDailySummaries(startDate: string, endDate: string): Promise<GarminJson> {
    return this.get("/usersummary-service/v2/dailysummaries", { startDate, endDate });
  }

  async getWeightMeasurements(startDate: string, endDate: string): Promise<GarminJson> {
    return this.get(`/weight-service/weight/range/${startDate}/${endDate}`, {
      includeAll: "true",
    });
  }

  async getSteps(startDate: string, endDate: string): Promise<GarminJson> {
    return this.get(`/usersummary-service/stats/steps/daily/${startDate}/${endDate}`);
  }

  async getStress(startDate: string, endDate: string): Promise<GarminJson> {
    return this.get(`/usersummary-service/stats/stress/daily/${startDate}/${endDate}`);
  }

  async healthCheck(): Promise<GarminHealthCheck> {
    const startedAt = this.now();
    try {
      await this.getProfileSettings();
      return { ok: true, latencyMs: this.now() - startedAt };
    } catch (error) {
      return {
        ok: false,
        latencyMs: this.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown Garmin error",
      };
    }
  }

  private async get(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<GarminJson> {
    const token = await this.getAccessToken();
    const url = this.buildUrl(path, query);

    let response = await this.request(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token.accessToken}`,
      },
    });

    if (response.status === 401) {
      const refreshed = await this.getAccessToken(true);
      response = await this.request(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${refreshed.accessToken}`,
        },
      });
    }

    if (!response.ok) {
      throw await this.toError(response, path);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json() as Promise<GarminJson>;
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async toError(response: Response, context: string): Promise<Error> {
    const retryAfter = response.headers.get("retry-after");
    const body = await response.text().catch(() => "");

    if (response.status === 401 || response.status === 403) {
      return new AuthExpiredError("garmin");
    }
    if (response.status === 429) {
      return new RateLimitedError(
        "garmin",
        retryAfter ? Number.parseInt(retryAfter, 10) : undefined,
      );
    }
    if (response.status >= 500) {
      return new ProviderUnavailableError("garmin", response.status);
    }

    return new ProviderError(
      "garmin",
      `Garmin request failed (${context}): ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      response.status,
    );
  }
}

function decodeJwtExpiry(token: string): number | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;

  try {
    const decoded = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const parsed = JSON.parse(decoded) as { exp?: unknown };
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
