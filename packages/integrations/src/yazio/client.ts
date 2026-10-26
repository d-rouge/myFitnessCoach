import { z } from "zod";
import {
  AuthExpiredError,
  InvalidResponseError,
  ProviderError,
  ProviderUnavailableError,
  RateLimitedError,
} from "../errors";

const DEFAULT_BASE_URL = "https://yzapi.yazio.com/v22";
const FALLBACK_BASE_URLS = ["https://yzapi.yazio.com/v20"];
const DEFAULT_CLIENT_ID = "3_5rbw4kehpugw8ogsc8ck8oo4ogswgckcskc04gcg8kk8k48ssw";
const DEFAULT_CLIENT_SECRET = "25gdtt1hvdi8gwowoww4oo88sgsw0oo04o0og0kkgwwks8k0k";
const DEFAULT_USER_AGENT = "YAZIO/26.30.1 (com.yazio.ios.YAZIO; build:2607271240; iOS 27.0.0) Ktor";
const TOKEN_REFRESH_WINDOW_MS = 60 * 1000;

const TokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
});

export type YazioJson = Record<string, unknown> | unknown[] | string | number | boolean | null;

/**
 * Yazio supports password login and token import.
 * Google/social accounts usually have no password: capture a refresh token
 * from the official app/web app and pass it here.
 */
export interface YazioCredentials {
  email?: string;
  password?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
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
  userAgent?: string;
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
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private baseUrl: string;
  private token?: YazioToken;

  constructor(options: YazioClientOptions) {
    const credentials = options.credentials;
    const hasPassword = Boolean(credentials.email && credentials.password);
    const hasToken = Boolean(credentials.accessToken || credentials.refreshToken);

    if (!hasPassword && !hasToken) {
      throw new Error(
        "Yazio credentials require email/password or an imported access/refresh token",
      );
    }

    this.credentials = credentials;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.clientId = options.clientId ?? DEFAULT_CLIENT_ID;
    this.clientSecret = options.clientSecret ?? DEFAULT_CLIENT_SECRET;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 30_000;

    if (credentials.accessToken) {
      this.token = {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt:
          credentials.expiresAt ??
          decodeJwtExpiry(credentials.accessToken) ??
          this.now() + 5 * 60 * 1000,
        baseUrl: this.baseUrl,
      };
    } else if (credentials.refreshToken) {
      this.token = {
        accessToken: "",
        refreshToken: credentials.refreshToken,
        expiresAt: 0,
        baseUrl: this.baseUrl,
      };
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async login(): Promise<YazioToken> {
    if (!this.credentials.email || !this.credentials.password) {
      throw new ProviderError(
        "yazio",
        "Yazio account has no password (Google/social login). Import a refresh token in secrets/yazio.json.",
        401,
      );
    }

    const candidates = [...new Set([this.baseUrl, DEFAULT_BASE_URL, ...FALLBACK_BASE_URLS])];
    let lastError: Error | undefined;

    for (const baseUrl of candidates) {
      const response = await this.request(
        `${baseUrl}/oauth/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": this.userAgent,
          },
          body: JSON.stringify({
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

  async getDailyNutrients(start: string, end: string): Promise<YazioJson> {
    return this.get("/user/consumed-items/nutrients-daily", { start, end });
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
    if (this.token?.accessToken && this.token.expiresAt > this.now() + TOKEN_REFRESH_WINDOW_MS) {
      return this.token;
    }

    if (this.token?.refreshToken) {
      try {
        return await this.refresh();
      } catch (error) {
        if (this.credentials.password) {
          return this.login();
        }
        throw error;
      }
    }

    if (this.credentials.password) {
      return this.login();
    }

    throw new AuthExpiredError("yazio");
  }

  private async refresh(): Promise<YazioToken> {
    if (!this.token?.refreshToken) {
      if (this.credentials.password) return this.login();
      throw new AuthExpiredError("yazio");
    }

    const response = await this.request(
      `${this.baseUrl}/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": this.userAgent,
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.token.refreshToken,
        }),
      },
      false,
    );

    if ([401, 404, 405, 410].includes(response.status)) {
      if (this.credentials.password) return this.login();
      throw new AuthExpiredError("yazio");
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
        "User-Agent": this.userAgent,
      },
    });

    if (response.status === 401) {
      const refreshed = await this.refresh();
      response = await this.request(this.buildUrl(path, query), {
        headers: {
          Authorization: `Bearer ${refreshed.accessToken}`,
          Accept: "application/json",
          "User-Agent": this.userAgent,
        },
      });
    }

    if ([404, 410].includes(response.status)) {
      const fallback = FALLBACK_BASE_URLS.find((candidate) => candidate !== this.baseUrl);
      if (fallback) {
        this.baseUrl = fallback;
        response = await this.request(this.buildUrl(path, query), {
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            Accept: "application/json",
            "User-Agent": this.userAgent,
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
    const isVersionBlocked = response.status === 403 && body.includes("version_blocked");

    if (isVersionBlocked) {
      return new ProviderError(
        "yazio",
        "Yazio version blocked: update the User-Agent (YAZIO_USER_AGENT) to a current app version",
        403,
      );
    }
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
