import type { Env } from "@health-trainer/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { AuthService } from "./auth.service.js";

const mockMongo = {
  getDb: async () => Promise.reject(new Error("No DB")),
} as unknown as MongoService;

const JWT_SECRET = "test-secret-key-with-at-least-32-chars";

function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    NODE_ENV: "development",
    API_PORT: 3000,
    WEB_ORIGIN: "http://localhost:5173",
    ENABLE_DEV_ENDPOINTS: true,
    JWT_SECRET,
    MONGODB_URI: "mongodb://127.0.0.1:27017/health_trainer",
    GOOGLE_CLIENT_ID: "client-id-123",
    GOOGLE_CLIENT_SECRET: "secret-456",
    GOOGLE_ALLOWED_EMAILS: ["runner@test.com"],
    FEATURE_GARMIN: true,
    FEATURE_YAZIO: true,
    FEATURE_ZEPP: false,
    FEATURE_HEVY: false,
    ...overrides,
  };
}

function stubTokenInfo(tokenInfo: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => tokenInfo,
    })),
  );
}

function validTokenInfo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: "https://accounts.google.com",
    aud: "client-id-123",
    sub: "google-sub-1",
    email: "runner@test.com",
    email_verified: "true",
    exp: String(Math.floor(Date.now() / 1000) + 3600),
    name: "Runner Test",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuthService", () => {
  it("detects whether Google auth is configured", () => {
    const unconfigured = new AuthService(createMockEnv({ GOOGLE_CLIENT_ID: undefined }), mockMongo);
    expect(unconfigured.isGoogleAuthConfigured()).toBe(false);
    expect(unconfigured.getGoogleClientId()).toBeNull();

    const configured = new AuthService(createMockEnv(), mockMongo);
    expect(configured.isGoogleAuthConfigured()).toBe(true);
    expect(configured.getGoogleClientId()).toBe("client-id-123");
  });

  it("performs devLogin and creates verifiable session token", async () => {
    const authService = new AuthService(createMockEnv(), mockMongo);

    const { token, user } = await authService.devLogin({
      email: "runner@test.com",
      name: "Runner Test",
    });

    expect(token).toBeDefined();
    expect(user.email).toBe("runner@test.com");
    expect(user.name).toBe("Runner Test");

    const resolvedUser = await authService.getUserFromToken(token);
    expect(resolvedUser?.email).toBe("runner@test.com");
    expect(resolvedUser?.name).toBe("Runner Test");
  });

  it("rejects devLogin when dev endpoints are disabled", async () => {
    const authService = new AuthService(createMockEnv({ ENABLE_DEV_ENDPOINTS: false }), mockMongo);

    await expect(authService.devLogin()).rejects.toThrow(/disabled/i);
  });

  it("accepts a verified Google token from an allowlisted email", async () => {
    stubTokenInfo(validTokenInfo());
    const authService = new AuthService(createMockEnv(), mockMongo);

    const user = await authService.verifyGoogleIdToken("valid-google-token");

    expect(user.email).toBe("runner@test.com");
    expect(user.id).toBe("google-sub-1");
  });

  it("rejects Google tokens with the wrong audience", async () => {
    stubTokenInfo(validTokenInfo({ aud: "another-client" }));
    const authService = new AuthService(createMockEnv(), mockMongo);

    await expect(authService.verifyGoogleIdToken("token")).rejects.toThrow(/audience/i);
  });

  it("rejects Google tokens with an unverified email", async () => {
    stubTokenInfo(validTokenInfo({ email_verified: "false" }));
    const authService = new AuthService(createMockEnv(), mockMongo);

    await expect(authService.verifyGoogleIdToken("token")).rejects.toThrow(/not verified/i);
  });

  it("rejects Google tokens with an invalid issuer", async () => {
    stubTokenInfo(validTokenInfo({ iss: "https://evil.example.com" }));
    const authService = new AuthService(createMockEnv(), mockMongo);

    await expect(authService.verifyGoogleIdToken("token")).rejects.toThrow(/issuer/i);
  });

  it("rejects Google tokens whose email is not allowlisted", async () => {
    stubTokenInfo(validTokenInfo({ email: "intruder@example.com" }));
    const authService = new AuthService(createMockEnv(), mockMongo);

    await expect(authService.verifyGoogleIdToken("token")).rejects.toThrow(/allowed list/i);
  });

  it("refuses Google login when the client id is not configured", async () => {
    const authService = new AuthService(createMockEnv({ GOOGLE_CLIENT_ID: undefined }), mockMongo);

    await expect(authService.verifyGoogleIdToken("token")).rejects.toThrow(/not configured/i);
  });
});
