import type { Env } from "@health-trainer/config";
import { getUserById, upsertUser } from "@health-trainer/db";
import type { User } from "@health-trainer/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
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
    return this.env.JWT_SECRET || "dev-jwt-secret-health-trainer-32chars!";
  }

  isGoogleAuthConfigured(): boolean {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET);
  }

  getAllowedEmails(): string[] {
    return this.env.GOOGLE_ALLOWED_EMAILS;
  }

  async verifyGoogleIdToken(idToken: string): Promise<User> {
    if (!idToken || typeof idToken !== "string") {
      throw new BadRequestException("id_token is required");
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

    if (!tokenInfo.email || !tokenInfo.sub) {
      throw new UnauthorizedException("Google token missing email or subject");
    }

    const email = tokenInfo.email.toLowerCase();

    // Check allowlist if configured
    const allowed = this.env.GOOGLE_ALLOWED_EMAILS;
    if (allowed.length > 0 && !allowed.includes(email)) {
      this.logger.warn(`Rejected login attempt from non-allowlisted email: ${email}`);
      throw new ForbiddenException("Email is not in the allowed list");
    }

    // Verify audience if client id is configured
    if (this.env.GOOGLE_CLIENT_ID && tokenInfo.aud !== this.env.GOOGLE_CLIENT_ID) {
      this.logger.warn(
        `Token audience mismatch: got ${tokenInfo.aud}, expected ${this.env.GOOGLE_CLIENT_ID}`,
      );
      throw new UnauthorizedException("Google token audience mismatch");
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
    if (db) {
      const user = await getUserById(db, payload.sub);
      if (user) return user;
    }

    // Fallback if DB is disconnected but token is valid
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      roles: payload.roles ?? ["athlete"],
      createdAt: new Date(payload.iat * 1000).toISOString(),
      lastLoginAt: new Date(payload.iat * 1000).toISOString(),
    };
  }

  async getMe(authHeader?: string): Promise<User> {
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const user = await this.getUserFromToken(token);
      if (user) return user;
    }

    // If dev endpoints enabled, return dev user
    if (this.env.ENABLE_DEV_ENDPOINTS) {
      const { user } = await this.devLogin();
      return user;
    }

    throw new UnauthorizedException("Authentication required");
  }
}
