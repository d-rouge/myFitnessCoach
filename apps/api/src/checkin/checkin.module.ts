import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PlanModule } from "../plan/plan.module.js";
import { CheckinController } from "./checkin.controller.js";
import { CheckinService } from "./checkin.service.js";

@Module({
  imports: [AuthModule, PlanModule],
  controllers: [CheckinController],
  providers: [CheckinService],
  exports: [CheckinService],
})
export class CheckinModule {}
