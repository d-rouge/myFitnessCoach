import {
  beginnerPersona,
  type FiveKProjectionInput,
  intermediatePersona,
  kneePainPersona,
} from "@health-trainer/domain";
import { Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { BaselineService } from "./baseline.service.js";

@Controller("baseline")
export class BaselineController {
  constructor(private readonly baselineService: BaselineService) {}

  @Get()
  async getCurrent(@CurrentUser() user: { id: string }) {
    const baseline = await this.baselineService.getCurrent(user.id);
    if (!baseline) {
      // Nest serializes null as an empty 200, which breaks clients expecting
      // JSON. Absence is explicit: the UI treats 404 as "no baseline yet".
      throw new NotFoundException("Nessuna baseline attiva trovata.");
    }
    return baseline;
  }

  @Post()
  async save(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.baselineService.save(user.id, body);
  }

  @Get("history")
  async getHistory(@CurrentUser() user: { id: string }) {
    return this.baselineService.getHistory(user.id);
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
