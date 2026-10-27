import type { User } from "@health-trainer/domain";
import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  type GenerateMacroInput,
  GenerateMacroSchema,
  type GenerateMicroInput,
  GenerateMicroSchema,
  type MicroQueryInput,
  MicroQuerySchema,
  type UpdateSessionInput,
  UpdateSessionSchema,
} from "./plan.schemas.js";
import { PlanService } from "./plan.service.js";

@Controller("plan")
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Get("macro")
  async getMacro(@CurrentUser() user: User) {
    return this.planService.getMacroPlan(user.id);
  }

  @Post("macro/generate")
  async generateMacro(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(GenerateMacroSchema)) body: GenerateMacroInput,
  ) {
    return this.planService.generateMacroPlan(user.id, body);
  }

  @Get("micro")
  async getMicro(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(MicroQuerySchema)) query: MicroQueryInput,
  ) {
    return this.planService.getMicroPlan(user.id, query.weekIndex);
  }

  @Post("micro/generate")
  async generateMicro(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(GenerateMicroSchema)) body: GenerateMicroInput,
  ) {
    return this.planService.generateMicroPlan(user.id, body.weekIndex);
  }

  @Get("today")
  async getToday(@CurrentUser() user: User) {
    return this.planService.getTodaySession(user.id);
  }

  @Patch("sessions/:sessionId")
  async updateSession(
    @CurrentUser() user: User,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(UpdateSessionSchema)) patch: UpdateSessionInput,
  ) {
    return this.planService.updateSession(user.id, sessionId, patch);
  }
}
