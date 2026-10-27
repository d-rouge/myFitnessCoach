import type { Env } from "@health-trainer/config";
import { COLLECTIONS } from "@health-trainer/db";
import type { User } from "@health-trainer/domain";
import { ConflictException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Db } from "mongodb";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { AuthService } from "./auth.service.js";
import { verifyPassword } from "./password.js";

const JWT_SECRET = "test-secret-key-with-at-least-32-chars";

function createEnv(overrides?: Partial<Env>): Env {
  return {
    NODE_ENV: "development",
    API_PORT: 3000,
    WEB_ORIGIN: "http://localhost:5173",
    ENABLE_DEV_ENDPOINTS: false,
    ENABLE_LOCAL_AUTH: true,
    JWT_SECRET,
    MONGODB_URI: "mongodb://127.0.0.1:27017/health_trainer",
    GOOGLE_ALLOWED_EMAILS: ["runner@test.com"],
    FEATURE_GARMIN: true,
    FEATURE_YAZIO: false,
    FEATURE_ZEPP: false,
    FEATURE_HEVY: false,
    ...overrides,
  };
}

interface FakeDb {
  db: Db;
  users: Map<string, User>;
  credentials: Map<string, Record<string, unknown>>;
}

/** Minimal in-memory stand-in for the Mongo collections used by auth. */
function createFakeDb(): FakeDb {
  const users = new Map<string, User>();
  const credentials = new Map<string, Record<string, unknown>>();

  const usersCollection = {
    findOne: async (filter: { id?: string; email?: string }) => {
      if (filter.id) return users.get(filter.id) ?? null;
      const email = filter.email;
      if (email) {
        return [...users.values()].find((user) => user.email === email.toLowerCase()) ?? null;
      }
      return null;
    },
    updateOne: async (
      filter: { id: string },
      update: { $set?: Partial<User>; $setOnInsert?: Partial<User> },
      options?: { upsert?: boolean },
    ) => {
      const existing = users.get(filter.id);
      if (existing) {
        Object.assign(existing, update.$set);
      } else if (options?.upsert) {
        users.set(filter.id, {
          ...(update.$setOnInsert as User),
          ...(update.$set as User),
          id: filter.id,
        });
      }
      return { acknowledged: true };
    },
    deleteOne: async (filter: { id: string }) => {
      users.delete(filter.id);
      return { acknowledged: true };
    },
  };

  const credentialsCollection = {
    findOne: async (filter: { userId?: string; email?: string }) => {
      if (filter.userId) return credentials.get(filter.userId) ?? null;
      if (filter.email) {
        return (
          [...credentials.values()].find((entry) => entry.email === filter.email?.toLowerCase()) ??
          null
        );
      }
      return null;
    },
    updateOne: async (
      filter: { userId: string },
      update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
    ) => {
      const existing = credentials.get(filter.userId);
      if (existing) Object.assign(existing, update.$set);
      else {
        credentials.set(filter.userId, {
          ...update.$setOnInsert,
          ...update.$set,
          userId: filter.userId,
        });
      }
      return { acknowledged: true };
    },
  };

  const collection = (name: string) => {
    if (name === COLLECTIONS.users) return usersCollection;
    if (name === COLLECTIONS.credentials) return credentialsCollection;
    throw new Error(`Unexpected collection in auth test: ${name}`);
  };

  return { db: { collection } as unknown as Db, users, credentials };
}

function createService(fake: FakeDb, overrides?: Partial<Env>): AuthService {
  const mongo = { getDb: async () => fake.db } as unknown as MongoService;
  return new AuthService(createEnv(overrides), mongo);
}

function stubTokenInfo(tokenInfo: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => tokenInfo })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuthService local accounts", () => {
  it("registers a user, hashes the password and issues a valid token", async () => {
    const fake = createFakeDb();
    const service = createService(fake);

    const { token, user } = await service.registerLocal({
      email: "  Runner@Example.com ",
      password: "correct horse battery",
      name: "",
    });

    expect(user.email).toBe("runner@example.com");
    expect(user.name).toBe("runner");
    expect(user.id.startsWith("usr_")).toBe(true);
    expect(user).not.toHaveProperty("passwordHash");

    const resolved = await service.getUserFromToken(token);
    expect(resolved?.id).toBe(user.id);

    const stored = [...fake.credentials.values()][0];
    expect(stored?.userId).toBe(user.id);
    expect(stored?.passwordHash).not.toBe("correct horse battery");
    await expect(
      verifyPassword("correct horse battery", String(stored?.passwordHash)),
    ).resolves.toBe(true);
  });

  it("rejects a duplicate email with 409 semantics", async () => {
    const fake = createFakeDb();
    const service = createService(fake);
    await service.registerLocal({ email: "runner@example.com", password: "password-123" });

    await expect(
      service.registerLocal({ email: "RUNNER@example.com", password: "password-456" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("logs in with the right password and rejects the wrong one", async () => {
    const fake = createFakeDb();
    const service = createService(fake);
    await service.registerLocal({ email: "runner@example.com", password: "password-123" });

    const { token, user } = await service.loginLocal({
      email: "runner@example.com",
      password: "password-123",
    });
    expect(user.email).toBe("runner@example.com");
    expect(await service.getUserFromToken(token)).not.toBeNull();

    await expect(
      service.loginLocal({ email: "runner@example.com", password: "wrong-password" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.loginLocal({ email: "unknown@example.com", password: "password-123" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses local registration when disabled", async () => {
    const fake = createFakeDb();
    const service = createService(fake, { ENABLE_LOCAL_AUTH: false });

    await expect(
      service.registerLocal({ email: "runner@example.com", password: "password-123" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("links a verified Google login to an existing local account by email", async () => {
    const fake = createFakeDb();
    const service = createService(fake, {
      GOOGLE_CLIENT_ID: "client-id-123",
      GOOGLE_CLIENT_SECRET: "secret-456",
    });
    const local = await service.registerLocal({
      email: "runner@test.com",
      password: "password-123",
      name: "Local Runner",
    });

    stubTokenInfo({
      iss: "https://accounts.google.com",
      aud: "client-id-123",
      sub: "google-sub-1",
      email: "runner@test.com",
      email_verified: "true",
      exp: String(Math.floor(Date.now() / 1000) + 3600),
      name: "Google Runner",
    });

    const linked = await service.verifyGoogleIdToken("token");
    expect(linked.id).toBe(local.user.id);
    expect(linked.name).toBe("Local Runner");
    expect(fake.users.size).toBe(1);
  });
});
