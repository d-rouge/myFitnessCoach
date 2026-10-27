import { describe, expect, it } from "vitest";
import { LocalLoginSchema, RegisterSchema } from "./auth.schemas.js";

describe("auth schemas", () => {
  it("normalizes the registration email and trims the name", () => {
    const parsed = RegisterSchema.parse({
      email: "  Runner@Example.COM ",
      password: "password-123",
      name: "  Marco  ",
    });

    expect(parsed.email).toBe("runner@example.com");
    expect(parsed.name).toBe("Marco");
  });

  it("reports Italian messages for invalid registration payloads", () => {
    const shortPassword = RegisterSchema.safeParse({
      email: "runner@example.com",
      password: "short",
    });
    expect(shortPassword.success).toBe(false);
    expect(shortPassword.error?.issues[0]?.message).toMatch(/almeno 8 caratteri/);

    const badEmail = RegisterSchema.safeParse({ email: "nope", password: "password-123" });
    expect(badEmail.success).toBe(false);
    expect(badEmail.error?.issues[0]?.message).toBe("Email non valida");
  });

  it("treats a blank name as omitted and requires a login password", () => {
    expect(
      RegisterSchema.parse({ email: "runner@example.com", password: "password-123", name: "" })
        .name,
    ).toBeUndefined();
    expect(LocalLoginSchema.safeParse({ email: "runner@example.com", password: "" }).success).toBe(
      false,
    );
  });
});
