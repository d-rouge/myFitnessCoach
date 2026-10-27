import { Module } from "@nestjs/common";
import { AthleteModule } from "../athlete/athlete.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PlanController } from "./plan.controller.js";
import { PlanService } from "./plan.service.js";

@Module({
  imports: [AuthModule, AthleteModule],
  controllers: [PlanController],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
