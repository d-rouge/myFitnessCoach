import { Body, Controller, Headers, Post } from "@nestjs/common";
import { AiService } from "./ai.service.js";

function resolveUserId(headerUserId?: string): string {
  return headerUserId?.trim() ? headerUserId.trim() : "user_marco";
}

@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("coach-advice")
  async getCoachAdvice(
    @Body() body: { sessionId?: string },
    @Headers("x-user-id") headerUserId?: string,
  ) {
    const userId = resolveUserId(headerUserId);
    return this.aiService.getCoachAdvice(userId, body?.sessionId);
  }
}
