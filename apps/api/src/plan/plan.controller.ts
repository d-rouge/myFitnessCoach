import type { User } from "@health-trainer/domain";
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { InterviewService } from "./interview.service.js";
import { MethodologyService } from "./methodology.service.js";
import {
  type GenerateMacroInput,
  GenerateMacroSchema,
  type GenerateMicroInput,
  GenerateMicroSchema,
  type InterviewMessageInput,
  InterviewMessageSchema,
  type MicroQueryInput,
  MicroQuerySchema,
  type UpdateSessionInput,
  UpdateSessionSchema,
} from "./plan.schemas.js";
import { PlanService } from "./plan.service.js";

@Controller("plan")
export class PlanController {
  constructor(
    private readonly planService: PlanService,
    private readonly methodologyService: MethodologyService,
    private readonly interviewService: InterviewService,
  ) {}

  @Get("macro")
  async getMacro(@CurrentUser() user: User) {
    const macroPlan = await this.planService.getMacroPlan(user.id);
    if (!macroPlan) {
      throw new NotFoundException("Nessun macro-piano attivo trovato.");
    }
    return macroPlan;
  }

  @Post("macro/generate")
  async generateMacro(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(GenerateMacroSchema)) body: GenerateMacroInput,
  ) {
    return this.planService.generateMacroPlan(user.id, body);
  }

  /** Chiede all'LLM la metodologia più efficace con i dati attuali. */
  @Post("methodology")
  async evaluateMethodology(@CurrentUser() user: User) {
    return this.methodologyService.evaluate(user.id);
  }

  @Get("methodology/latest")
  async latestMethodology(@CurrentUser() user: User) {
    return { evaluation: await this.methodologyService.latest(user.id) };
  }

  @Post("interview")
  async startInterview(@CurrentUser() user: User) {
    return this.interviewService.start(user.id);
  }

  @Get("interview/latest")
  async latestInterview(@CurrentUser() user: User) {
    return { interview: await this.interviewService.latest(user.id) };
  }

  @Post("interview/:id/message")
  async interviewMessage(
    @CurrentUser() user: User,
    @Param("id") interviewId: string,
    @Body(new ZodValidationPipe(InterviewMessageSchema)) body: InterviewMessageInput,
  ) {
    return this.interviewService.message(user.id, interviewId, body.message);
  }

  @Post("interview/:id/generate")
  async generateFromInterview(@CurrentUser() user: User, @Param("id") interviewId: string) {
    return this.interviewService.generate(user.id, interviewId);
  }

  @Get("micro")
  async getMicro(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(MicroQuerySchema)) query: MicroQueryInput,
  ) {
    const microPlan = await this.planService.getMicroPlan(user.id, query.weekIndex);
    if (!microPlan) {
      throw new NotFoundException("Nessun micro-piano attivo trovato.");
    }
    return microPlan;
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
