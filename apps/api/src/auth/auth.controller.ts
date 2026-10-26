import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { AuthService } from "./auth.service.js";

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("me")
  async getMe(@Headers("authorization") authHeader?: string) {
    return this.auth.getMe(authHeader);
  }

  @Get("auth/status")
  getStatus() {
    return {
      googleConfigured: this.auth.isGoogleAuthConfigured(),
      allowedEmailsCount: this.auth.getAllowedEmails().length,
      devLoginEnabled: true,
    };
  }

  @Post("auth/google")
  async googleLogin(@Body() body: { id_token?: string }) {
    const user = await this.auth.verifyGoogleIdToken(body?.id_token ?? "");
    const token = this.auth.createSessionToken(user);
    return { token, user };
  }

  @Post("auth/dev-login")
  async devLogin(@Body() body?: { email?: string; name?: string }) {
    return this.auth.devLogin(body);
  }

  @Post("auth/logout")
  logout() {
    return { ok: true };
  }
}
