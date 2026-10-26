import {
  beginnerPersona,
  type FiveKProjectionInput,
  intermediatePersona,
  kneePainPersona,
} from "@health-trainer/domain";
import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { BaselineService } from "./baseline.service.js";

@Controller("baseline")
export class BaselineController {
  constructor(
    private readonly baselineService: BaselineService,
    private readonly authService: AuthService,
  ) {}

  private async resolveUserId(authHeader?: string): Promise<string> {
    const user = await this.authService.getMe(authHeader);
    return user.id;
  }

  @Get()
  async getCurrent(@Headers("authorization") authHeader?: string) {
    const userId = await this.resolveUserId(authHeader);
    return this.baselineService.getCurrent(userId);
  }

  @Post()
  async save(@Body() body: unknown, @Headers("authorization") authHeader?: string) {
    const userId = await this.resolveUserId(authHeader);
    return this.baselineService.save(userId, body);
  }

  @Get("history")
  async getHistory(@Headers("authorization") authHeader?: string) {
    const userId = await this.resolveUserId(authHeader);
    return this.baselineService.getHistory(userId);
  }

  @Get("personas")
  getPersonas() {
    return {
      beginner: beginnerPersona,
      intermediate: intermediatePersona,
      kneePain: kneePainPersona,
    };
  }

  @Post("safety")
  checkSafety(@Body() body: { anamnesis: unknown }) {
    return this.baselineService.evaluateSafety(body?.anamnesis);
  }

  @Post("feasibility")
  checkFeasibility(@Body() body: FiveKProjectionInput) {
    return this.baselineService.evaluate5kFeasibility(body);
  }
}
