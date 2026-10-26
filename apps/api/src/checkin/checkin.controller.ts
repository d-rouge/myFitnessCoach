import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { CheckinService } from "./checkin.service.js";

@Controller("checkin")
export class CheckinController {
  constructor(
    private readonly checkinService: CheckinService,
    private readonly authService: AuthService,
  ) {}

  private async resolveUserId(authHeader?: string): Promise<string> {
    const user = await this.authService.getMe(authHeader);
    return user.id;
  }

  @Post()
  async save(@Body() body: unknown, @Headers("authorization") authHeader?: string) {
    const userId = await this.resolveUserId(authHeader);
    return this.checkinService.saveCheckin(userId, body);
  }

  @Get("today")
  async getToday(@Headers("authorization") authHeader?: string) {
    const userId = await this.resolveUserId(authHeader);
    return this.checkinService.getTodayCheckin(userId);
  }
}
