import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies safe defaults", () => {
    const env = loadEnv({ NODE_ENV: "test" } as NodeJS.ProcessEnv);

    expect(env.API_PORT).toBe(3000);
    expect(env.MONGODB_URI).toContain("health_trainer");
    expect(env.GOOGLE_ALLOWED_EMAILS).toEqual([]);
    expect(env.ENABLE_DEV_ENDPOINTS).toBe(true);
  });

  it("parses comma separated emails and booleans", () => {
    const env = loadEnv({
      NODE_ENV: "development",
      GOOGLE_ALLOWED_EMAILS: "Me@Example.com, you@example.com ",
      FEATURE_YAZIO: "true",
    } as NodeJS.ProcessEnv);

    expect(env.GOOGLE_ALLOWED_EMAILS).toEqual(["me@example.com", "you@example.com"]);
    expect(env.FEATURE_YAZIO).toBe(true);
  });

  it("rejects invalid ports", () => {
    expect(() => loadEnv({ NODE_ENV: "test", API_PORT: "abc" } as NodeJS.ProcessEnv)).toThrow(
      /API_PORT/,
    );
  });
});
