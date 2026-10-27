import type { Env } from "@health-trainer/config";
import { getUserById, upsertUser } from "@health-trainer/db";
import type { User } from "@health-trainer/domain";
import {
  BadRequestException,
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
    const user: User = {
      id: tokenInfo.sub,
      email,
      name: tokenInfo.name || email.split("@")[0] || "User",
      picture: tokenInfo.picture,
      roles: ["athlete"],
      createdAt: now,
      lastLoginAt: now,
    };

    const db = await this.getDb();
    if (db) {
      return upsertUser(db, user);
    }

    return user;
  }

  private async getDb() {
    try {
      return await this.mongo.getDb();
    } catch {
      return null;
    }
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
