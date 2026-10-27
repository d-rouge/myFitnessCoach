import type { User } from "@health-trainer/domain";
import { Body, Controller, Get, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  type DevLoginInput,
  DevLoginSchema,
  type GoogleLoginInput,
  GoogleLoginSchema,
} from "./auth.schemas.js";
import { AuthService } from "./auth.service.js";
import { CurrentUser } from "./current-user.decorator.js";
import { Public } from "./public.decorator.js";

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("me")
  getMe(@CurrentUser() user: User): User {
    return user;
  }

  @Get("auth/status")
  @Public()
  getStatus() {
    return {
      googleConfigured: this.auth.isGoogleAuthConfigured(),
      googleClientId: this.auth.getGoogleClientId(),
      allowedEmailsCount: this.auth.getAllowedEmails().length,
      devLoginEnabled: this.auth.devLoginEnabled(),
    };
  }

  @Post("auth/google")
  @Public()
  async googleLogin(@Body(new ZodValidationPipe(GoogleLoginSchema)) body: GoogleLoginInput) {
    const user = await this.auth.verifyGoogleIdToken(body.id_token);
    const token = this.auth.createSessionToken(user);
    return { token, user };
  }

  @Post("auth/dev-login")
  @Public()
  async devLogin(@Body(new ZodValidationPipe(DevLoginSchema)) body: DevLoginInput) {
    return this.auth.devLogin(body);
  }

  @Post("auth/logout")
  @Public()
  logout() {
    return { ok: true };
  }
}
