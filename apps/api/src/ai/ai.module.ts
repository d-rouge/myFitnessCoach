import { Module } from "@nestjs/common";
import { AthleteModule } from "../athlete/athlete.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AiController } from "./ai.controller.js";
import { AiService } from "./ai.service.js";

@Module({
  imports: [DatabaseModule, AthleteModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
