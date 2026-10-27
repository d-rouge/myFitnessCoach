import { randomUUID } from "node:crypto";
import type { Env } from "@health-trainer/config";
import {
  COLLECTIONS,
  getCredentialsByEmail,
  getUserByEmail,
  getUserById,
  saveCredentials,
  upsertUser,
} from "@health-trainer/db";
import type { User } from "@health-trainer/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { PERSONAL_USER_ID } from "../config/constants.js";
import { APP_ENV } from "../config/env.module.js";
import { MongoService } from "../database/mongo.service.js";
import { signJwt, verifyJwt } from "./jwt.util.js";
import { hashPassword, verifyPassword } from "./password.js";

interface GoogleTokenInfo {
  iss?: string;
  sub?: string;
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  exp?: string;
  name?: string;
  picture?: string;
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly mongo: MongoService,
  ) {}

  private get jwtSecret(): string {
    const secret = this.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }
    return secret;
  }

  isGoogleAuthConfigured(): boolean {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET);
  }

  /** Public OAuth client id, needed by the browser to start Google Sign-In. */
  getGoogleClientId(): string | null {
    return this.env.GOOGLE_CLIENT_ID ?? null;
  }

  devLoginEnabled(): boolean {
    return this.env.ENABLE_DEV_ENDPOINTS;
  }

  /** Email + password accounts are enabled unless explicitly disabled. */
  isLocalAuthEnabled(): boolean {
    return this.env.ENABLE_LOCAL_AUTH;
  }

  getAllowedEmails(): string[] {
    return this.env.GOOGLE_ALLOWED_EMAILS;
  }

  async verifyGoogleIdToken(idToken: string): Promise<User> {
    if (!idToken || typeof idToken !== "string") {
      throw new BadRequestException("id_token is required");
    }

    const clientId = this.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new ServiceUnavailableException("Google authentication is not configured");
    }

    let tokenInfo: GoogleTokenInfo;
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
      if (!res.ok) {
        throw new Error(`Google tokeninfo returned status ${res.status}`);
      }
      tokenInfo = (await res.json()) as GoogleTokenInfo;
    } catch (err) {
      this.logger.warn(`Google token validation failed: ${(err as Error).message}`);
      throw new UnauthorizedException("Invalid Google token");
    }

    const validIssuers = new Set(["accounts.google.com", "https://accounts.google.com"]);
    if (!tokenInfo.iss || !validIssuers.has(tokenInfo.iss)) {
      throw new UnauthorizedException("Invalid Google token issuer");
    }

    if (tokenInfo.aud !== clientId) {
      this.logger.warn(
        `Token audience mismatch: got ${tokenInfo.aud}, expected ${this.env.GOOGLE_CLIENT_ID}`,
      );
      throw new UnauthorizedException("Google token audience mismatch");
    }

    const emailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === "true";
    if (!emailVerified) {
      throw new UnauthorizedException("Google email is not verified");
    }

    const expiresAt = Number(tokenInfo.exp);
    if (Number.isFinite(expiresAt) && expiresAt * 1000 <= Date.now()) {
      throw new UnauthorizedException("Google token is expired");
    }

    if (!tokenInfo.email || !tokenInfo.sub) {
      throw new UnauthorizedException("Google token missing email or subject");
    }

    const email = tokenInfo.email.toLowerCase();
    const allowed = this.env.GOOGLE_ALLOWED_EMAILS;
    if (allowed.length === 0 || !allowed.includes(email)) {
      this.logger.warn(`Rejected login attempt from non-allowlisted email: ${email}`);
      throw new ForbiddenException("Email is not in the allowed list");
    }

    const now = new Date().toISOString();
    const db = await this.getDb();

    // A verified Google email can sign in to an existing local account: the
    // account is identified by email, so both methods reach the same data.
    const existing = db ? await getUserByEmail(db, email) : null;
    const googleName = tokenInfo.name || email.split("@")[0] || "User";
    const user: User = {
      id: existing?.id ?? tokenInfo.sub,
      email,
      name: existing?.name ?? googleName,
      picture: tokenInfo.picture ?? existing?.picture,
      roles: existing?.roles ?? ["athlete"],
      createdAt: existing?.createdAt ?? now,
      lastLoginAt: now,
    };

    if (db) {
      return upsertUser(db, user);
    }

    return user;
  }

  /**
   * Creates a local account. The public user document never contains password
   * material: credentials live in their own collection.
   */
  async registerLocal(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<{ token: string; user: User }> {
    if (!this.isLocalAuthEnabled()) {
      throw new ForbiddenException("La registrazione con email e password è disabilitata.");
    }

    const db = await this.requireDb();
    const email = input.email.trim().toLowerCase();

    if (await getUserByEmail(db, email)) {
      throw new ConflictException("Esiste già un account con questa email.");
    }

    const now = new Date().toISOString();
    const user: User = {
      id: `usr_${randomUUID()}`,
      email,
      name: input.name?.trim() || email.split("@")[0] || "Atleta",
      roles: ["athlete"],
      createdAt: now,
      lastLoginAt: now,
    };
    const passwordHash = await hashPassword(input.password);

    let created: User;
    try {
      created = await upsertUser(db, user);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException("Esiste già un account con questa email.");
      }
      throw error;
    }

    try {
      await saveCredentials(db, {
        userId: created.id,
        email,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      // Do not leave a user without credentials behind if the insert fails.
      await db.collection(COLLECTIONS.users).deleteOne({ id: created.id });
      if (isDuplicateKey(error)) {
        throw new ConflictException("Esiste già un account con questa email.");
      }
      throw error;
    }

    return { token: this.createSessionToken(created), user: created };
  }

  /** Authenticates an email + password account. */
  async loginLocal(input: {
    email: string;
    password: string;
  }): Promise<{ token: string; user: User }> {
    if (!this.isLocalAuthEnabled()) {
      throw new ForbiddenException("L'accesso con email e password è disabilitato.");
    }

    const db = await this.requireDb();
    const credentials = await getCredentialsByEmail(db, input.email.trim().toLowerCase());

    if (!credentials) {
      // Same scrypt cost as a real check, so unknown emails are not cheap to probe.
      await hashPassword(input.password);
      throw new UnauthorizedException("Email o password non validi.");
    }

    if (!(await verifyPassword(input.password, credentials.passwordHash))) {
      throw new UnauthorizedException("Email o password non validi.");
    }

    const user = await getUserById(db, credentials.userId);
    if (!user) {
      throw new UnauthorizedException("Email o password non validi.");
    }

    const updated = await upsertUser(db, { ...user, lastLoginAt: new Date().toISOString() });
    return { token: this.createSessionToken(updated), user: updated };
  }

  private async getDb() {
    try {
      return await this.mongo.getDb();
    } catch {
      return null;
    }
  }

  private async requireDb() {
    const db = await this.getDb();
    if (!db) {
      throw new ServiceUnavailableException("Database non disponibile: riprova tra poco.");
    }
    return db;
  }

  createSessionToken(user: User): string {
    return signJwt(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
      },
      this.jwtSecret,
    );
  }

  async devLogin(options?: {
    email?: string;
    name?: string;
  }): Promise<{ token: string; user: User }> {
    if (!this.env.ENABLE_DEV_ENDPOINTS) {
      throw new ForbiddenException("Dev login is disabled");
    }

    const defaultEmail = this.env.GOOGLE_ALLOWED_EMAILS[0] || "d-rouge@users.noreply.github.com";
    const email = (options?.email || defaultEmail).toLowerCase();
    const name = options?.name || "Personal Athlete (Dev)";
    const now = new Date().toISOString();

    const user: User = {
      id: PERSONAL_USER_ID,
      email,
      name,
      roles: ["athlete", "admin"],
      createdAt: now,
      lastLoginAt: now,
    };

    let persistedUser = user;
    const db = await this.getDb();
    if (db) {
      persistedUser = await upsertUser(db, user);
    }

    const token = this.createSessionToken(persistedUser);
    return { token, user: persistedUser };
  }

  async getUserFromToken(token: string): Promise<User | null> {
    const payload = verifyJwt(token, this.jwtSecret);
    if (!payload) return null;

    const db = await this.getDb();
    if (!db) {
      // Token remains verifiable when the database is temporarily unavailable.
      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        roles: payload.roles ?? ["athlete"],
        createdAt: new Date(payload.iat * 1000).toISOString(),
        lastLoginAt: new Date(payload.iat * 1000).toISOString(),
      };
    }

    return getUserById(db, payload.sub);
  }
}
