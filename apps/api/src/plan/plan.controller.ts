import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { PlanService } from "./plan.service.js";

@Controller("plan")
export class PlanController {
  constructor(
    private readonly planService: PlanService,
    private readonly authService: AuthService,
  ) {}

  private async resolveUserId(authHeader?: string): Promise<string> {
    const user = await this.authService.getMe(authHeader);
    return user.id;
  }

  @Get("macro")
  async getMacro(@Headers("authorization") authHeader?: string) {
    const userId = await this.resolveUserId(authHeader);
    return this.planService.getMacroPlan(userId);
  }

  @Post("macro/generate")
  async generateMacro(
    @Body() body: { startDate?: string; totalWeeks?: number },
    @Headers("authorization") authHeader?: string,
  ) {
    const userId = await this.resolveUserId(authHeader);
    return this.planService.generateMacroPlan(userId, body);
  }

  @Get("micro")
  async getMicro(
    @Query("weekIndex") weekIndex?: string,
    @Headers("authorization") authHeader?: string,
  ) {
    const userId = await this.resolveUserId(authHeader);
    const parsedWeek = weekIndex ? Number.parseInt(weekIndex, 10) : undefined;
    return this.planService.getMicroPlan(userId, parsedWeek);
  }

  @Post("micro/generate")
  async generateMicro(
    @Body() body: { weekIndex: number },
    @Headers("authorization") authHeader?: string,
  ) {
    const userId = await this.resolveUserId(authHeader);
    return this.planService.generateMicroPlan(userId, body.weekIndex);
  }

  @Get("today")
  async getToday(@Headers("authorization") authHeader?: string) {
    const userId = await this.resolveUserId(authHeader);
    return this.planService.getTodaySession(userId);
  }

  @Patch("sessions/:sessionId")
  async updateSession(
    @Param("sessionId") sessionId: string,
    @Body()
    patch: {
      status?: "planned" | "completed" | "skipped" | "adjusted";
      notes?: string;
    },
    @Headers("authorization") authHeader?: string,
  ) {
    const userId = await this.resolveUserId(authHeader);
    return this.planService.updateSession(userId, sessionId, patch);
  }
}
