import { describe, expect, it } from "vitest";
import { signJwt, verifyJwt } from "./jwt.util.js";

describe("jwt.util", () => {
  const secret = "test-secret-key-12345678901234567890";

  it("signs and verifies a valid JWT token", () => {
    const token = signJwt(
      {
        sub: "user-123",
        email: "runner@test.com",
        name: "Test Runner",
        roles: ["athlete"],
      },
      secret,
    );

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const verified = verifyJwt(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe("user-123");
    expect(verified?.email).toBe("runner@test.com");
    expect(verified?.name).toBe("Test Runner");
  });

  it("rejects token signed with a different secret", () => {
    const token = signJwt(
      {
        sub: "user-123",
        email: "runner@test.com",
        name: "Test Runner",
      },
      secret,
    );

    const verified = verifyJwt(token, "wrong-secret-key-99999999999999999");
    expect(verified).toBeNull();
  });

  it("rejects expired token", () => {
    const token = signJwt(
      {
        sub: "user-123",
        email: "runner@test.com",
        name: "Test Runner",
        expiresInSec: -10, // already expired
      },
      secret,
    );

    const verified = verifyJwt(token, secret);
    expect(verified).toBeNull();
  });

  it("rejects malformed token strings", () => {
    expect(verifyJwt("not-a-token", secret)).toBeNull();
    expect(verifyJwt("a.b", secret)).toBeNull();
    expect(verifyJwt("a.b.c.d", secret)).toBeNull();
  });
});
