import { type Checkin, CheckinSchema, type User } from "@health-trainer/domain";
import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { CheckinService } from "./checkin.service.js";

@Controller("checkin")
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Post()
  async save(@CurrentUser() user: User, @Body(new ZodValidationPipe(CheckinSchema)) body: Checkin) {
    return this.checkinService.saveCheckin(user.id, body);
  }

  @Get("today")
  async getToday(@CurrentUser() user: User) {
    return this.checkinService.getTodayCheckin(user.id);
  }
}
