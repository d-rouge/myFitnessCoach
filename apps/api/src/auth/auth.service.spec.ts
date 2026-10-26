import type { Env } from "@health-trainer/config";
import { describe, expect, it } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { AuthService } from "./auth.service.js";

const mockMongo = {
  getDb: async () => Promise.reject(new Error("No DB")),
} as unknown as MongoService;

function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    NODE_ENV: "development",
    API_PORT: 3000,
    WEB_ORIGIN: "http://localhost:5173",
    ENABLE_DEV_ENDPOINTS: true,
    MONGODB_URI: "mongodb://127.0.0.1:27017/health_trainer",
    GOOGLE_ALLOWED_EMAILS: ["runner@test.com"],
    FEATURE_GARMIN: true,
    FEATURE_YAZIO: true,
    FEATURE_ZEPP: false,
    FEATURE_HEVY: false,
    ...overrides,
  };
}

describe("AuthService", () => {
  it("detects whether Google auth is configured", () => {
    const unconfigured = new AuthService(createMockEnv(), mockMongo);
    expect(unconfigured.isGoogleAuthConfigured()).toBe(false);

    const configured = new AuthService(
      createMockEnv({
        GOOGLE_CLIENT_ID: "client-id-123",
        GOOGLE_CLIENT_SECRET: "secret-456",
      }),
      mockMongo,
    );
    expect(configured.isGoogleAuthConfigured()).toBe(true);
  });

  it("performs devLogin and creates verifiable session token", async () => {
    const authService = new AuthService(
      createMockEnv({
        JWT_SECRET: "custom-secret-key-for-testing-12345",
      }),
      mockMongo,
    );

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

  it("returns dev user on getMe when dev endpoints are enabled", async () => {
    const authService = new AuthService(createMockEnv(), mockMongo);

    const me = await authService.getMe();
    expect(me.email).toBe("runner@test.com");
    expect(me.roles).toContain("athlete");
  });
});
