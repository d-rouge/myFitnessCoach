import { z } from "zod";
import {
  AuthExpiredError,
  InvalidResponseError,
  ProviderError,
  ProviderUnavailableError,
  RateLimitedError,
} from "../errors";

const DEFAULT_BASE_URL = "https://yzapi.yazio.com/v15";
const FALLBACK_BASE_URLS = ["https://yzapi.yazio.com/v20"];
const DEFAULT_CLIENT_ID = "1_4hiybetvfksgw40o0sog4s884kwc840wwso8go4k8c04goo4c";
const DEFAULT_CLIENT_SECRET = "6rok2m65xuskgkgogw40wkkk8sw0osg84s8cggsc4woos4s8o";
const TOKEN_REFRESH_WINDOW_MS = 60 * 1000;

const TokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
});

export type YazioJson = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface YazioCredentials {
  email: string;
  password: string;
}

export interface YazioToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  baseUrl: string;
}

export interface YazioClientOptions {
  credentials: YazioCredentials;
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export interface YazioHealthCheck {
  ok: boolean;
  latencyMs: number;
  baseUrl: string;
  error?: string;
}

export class YazioClient {
  private readonly credentials: YazioCredentials;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private baseUrl: string;
  private token?: YazioToken;

  constructor(options: YazioClientOptions) {
    if (!options.credentials.email.trim() || !options.credentials.password) {
      throw new Error("Yazio email and password are required");
    }

    this.credentials = options.credentials;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.clientId = options.clientId ?? DEFAULT_CLIENT_ID;
    this.clientSecret = options.clientSecret ?? DEFAULT_CLIENT_SECRET;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async login(): Promise<YazioToken> {
    const candidates = [...new Set([this.baseUrl, DEFAULT_BASE_URL, ...FALLBACK_BASE_URLS])];
    let lastError: Error | undefined;

    for (const baseUrl of candidates) {
      const response = await this.request(
        `${baseUrl}/oauth/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "password",
            client_id: this.clientId,
            client_secret: this.clientSecret,
            username: this.credentials.email,
            password: this.credentials.password,
          }),
        },
        false,
      );

      if ([404, 405, 410].includes(response.status)) {
        lastError = new ProviderError(
          "yazio",
          `Yazio token endpoint not available on ${baseUrl}`,
          response.status,
        );
        continue;
      }

      if (!response.ok) {
        throw await this.toError(response, "token");
      }

      const parsed = TokenSchema.safeParse(await response.json());
      if (!parsed.success) {
        lastError = new InvalidResponseError("yazio", "Invalid Yazio token response");
        continue;
      }

      this.baseUrl = baseUrl;
      this.token = {
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token,
        expiresAt: this.now() + (parsed.data.expires_in ?? 86_400) * 1000,
        baseUrl,
      };

      return this.token;
    }

    throw lastError ?? new ProviderError("yazio", "Unable to login to Yazio");
  }

  async getUser(): Promise<YazioJson> {
    return this.get("/user");
  }

  async getDailySummary(date: string): Promise<YazioJson> {
    return this.get("/user/widgets/daily-summary", { date });
  }

  async getConsumedItems(date: string): Promise<YazioJson> {
    return this.get("/user/consumed-items", { date });
  }

  async getWeight(date: string): Promise<YazioJson> {
    return this.get("/user/bodyvalues/weight/last", { date });
  }

  async getGoals(date: string): Promise<YazioJson> {
    return this.get("/user/goals/unmodified", { date });
  }

  async getSettings(): Promise<YazioJson> {
    return this.get("/user/settings");
  }

  async getExercises(date: string): Promise<YazioJson> {
    return this.get("/user/exercises", { date });
  }

  async healthCheck(): Promise<YazioHealthCheck> {
    const startedAt = this.now();
    try {
      await this.getUser();
      return { ok: true, latencyMs: this.now() - startedAt, baseUrl: this.baseUrl };
    } catch (error) {
      return {
        ok: false,
        latencyMs: this.now() - startedAt,
        baseUrl: this.baseUrl,
        error: error instanceof Error ? error.message : "Unknown Yazio error",
      };
    }
  }

  private async ensureToken(): Promise<YazioToken> {
    if (this.token && this.token.expiresAt > this.now() + TOKEN_REFRESH_WINDOW_MS) {
      return this.token;
    }

    if (this.token?.refreshToken) {
      try {
        return await this.refresh();
      } catch {
        return this.login();
      }
    }

    return this.login();
  }

  private async refresh(): Promise<YazioToken> {
    if (!this.token?.refreshToken) {
      return this.login();
    }

    const response = await this.request(
      `${this.baseUrl}/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.token.refreshToken,
        }),
      },
      false,
    );

    if ([401, 404, 405, 410].includes(response.status)) {
      return this.login();
    }

    if (!response.ok) {
      throw await this.toError(response, "token-refresh");
    }

    const parsed = TokenSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new InvalidResponseError("yazio", "Invalid Yazio refresh response");
    }

    this.token = {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token ?? this.token.refreshToken,
      expiresAt: this.now() + (parsed.data.expires_in ?? 86_400) * 1000,
      baseUrl: this.baseUrl,
    };

    return this.token;
  }

  private async get(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<YazioJson> {
    const token = await this.ensureToken();
    let response = await this.request(this.buildUrl(path, query), {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: "application/json",
      },
    });

    if (response.status === 401) {
      const refreshed = await this.refresh();
      response = await this.request(this.buildUrl(path, query), {
        headers: {
          Authorization: `Bearer ${refreshed.accessToken}`,
          Accept: "application/json",
        },
      });
    }

    // v15 can be deprecated on some accounts; retry once on the current fallback.
    if ([404, 410].includes(response.status)) {
      const fallback = FALLBACK_BASE_URLS.find((candidate) => candidate !== this.baseUrl);
      if (fallback) {
        this.baseUrl = fallback;
        response = await this.request(this.buildUrl(path, query), {
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            Accept: "application/json",
          },
        });
      }
    }

    if (!response.ok) {
      throw await this.toError(response, path);
    }

    if (response.status === 204) return null;
    return response.json() as Promise<YazioJson>;
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

  private async request(url: string, init: RequestInit, withTimeout = true): Promise<Response> {
    if (!withTimeout) {
      return this.fetchImpl(url, init);
    }

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
      return new AuthExpiredError("yazio");
    }
    if (response.status === 429) {
      return new RateLimitedError(
        "yazio",
        retryAfter ? Number.parseInt(retryAfter, 10) : undefined,
      );
    }
    if (response.status >= 500) {
      return new ProviderUnavailableError("yazio", response.status);
    }

    return new ProviderError(
      "yazio",
      `Yazio request failed (${context}): ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      response.status,
    );
  }
}
