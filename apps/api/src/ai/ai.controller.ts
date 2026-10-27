import type { User } from "@health-trainer/domain";
import { Body, Controller, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type CoachAdviceRequest, CoachAdviceRequestSchema } from "./ai.schemas.js";
import { AiService } from "./ai.service.js";

@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("coach-advice")
  async getCoachAdvice(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CoachAdviceRequestSchema)) body: CoachAdviceRequest,
  ) {
    return this.aiService.getCoachAdvice(user.id, body.sessionId);
  }
}
