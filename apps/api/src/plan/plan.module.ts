import { Module } from "@nestjs/common";
import { AthleteModule } from "../athlete/athlete.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { BaselineModule } from "../baseline/baseline.module.js";
import { InterviewService } from "./interview.service.js";
import { MethodologyService } from "./methodology.service.js";
import { PlanController } from "./plan.controller.js";
import { PlanService } from "./plan.service.js";

@Module({
  imports: [AuthModule, AthleteModule, BaselineModule],
  controllers: [PlanController],
  providers: [PlanService, MethodologyService, InterviewService],
  exports: [PlanService, MethodologyService],
})
export class PlanModule {}
