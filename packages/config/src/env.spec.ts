import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const VALID_SECRET = "test-secret-key-with-at-least-32-chars";

describe("loadEnv", () => {
  it("applies safe defaults", () => {
    const env = loadEnv({ NODE_ENV: "test" } as NodeJS.ProcessEnv);

    expect(env.API_PORT).toBe(3000);
    expect(env.MONGODB_URI).toContain("health_trainer");
    expect(env.GOOGLE_ALLOWED_EMAILS).toEqual([]);
    expect(env.ENABLE_DEV_ENDPOINTS).toBe(false);
    expect(env.ENABLE_LOCAL_AUTH).toBe(true);
  });

  it("parses comma separated emails and booleans", () => {
    const env = loadEnv({
      NODE_ENV: "development",
      JWT_SECRET: VALID_SECRET,
      GOOGLE_ALLOWED_EMAILS: "Me@Example.com, you@example.com ",
      FEATURE_YAZIO: "true",
    } as NodeJS.ProcessEnv);

    expect(env.GOOGLE_ALLOWED_EMAILS).toEqual(["me@example.com", "you@example.com"]);
    expect(env.FEATURE_YAZIO).toBe(true);
  });

  it("requires a strong JWT secret outside tests", () => {
    expect(() => loadEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
    expect(() =>
      loadEnv({ NODE_ENV: "production", JWT_SECRET: "too-short" } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_SECRET/);
    expect(() =>
      loadEnv({ NODE_ENV: "production", JWT_SECRET: VALID_SECRET } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("requires an allowlist when Google is configured", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "development",
        JWT_SECRET: VALID_SECRET,
        GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
      } as NodeJS.ProcessEnv),
    ).toThrow(/GOOGLE_ALLOWED_EMAILS/);
  });

  it("rejects invalid ports", () => {
    expect(() => loadEnv({ NODE_ENV: "test", API_PORT: "abc" } as NodeJS.ProcessEnv)).toThrow(
      /API_PORT/,
    );
  });
});
