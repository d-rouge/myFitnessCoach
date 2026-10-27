import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AthleteController } from "./athlete.controller.js";
import { AthleteService } from "./athlete.service.js";

@Module({
  imports: [AuthModule],
  controllers: [AthleteController],
  providers: [AthleteService],
  exports: [AthleteService],
})
export class AthleteModule {}
