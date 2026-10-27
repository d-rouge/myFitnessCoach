import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("verifies the original password and rejects a different one", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).not.toContain("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("uses a different salt for every hash", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");

    expect(first).not.toBe(second);
    await expect(verifyPassword("same-password", first)).resolves.toBe(true);
    await expect(verifyPassword("same-password", second)).resolves.toBe(true);
  });

  it("rejects malformed stored hashes without throwing", async () => {
    await expect(verifyPassword("password", "")).resolves.toBe(false);
    await expect(verifyPassword("password", "plain-text")).resolves.toBe(false);
    await expect(verifyPassword("password", "scrypt$notbase64$notbase64")).resolves.toBe(false);
    await expect(verifyPassword("password", "argon2$salt$key")).resolves.toBe(false);
  });
});
