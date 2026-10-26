import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BaselineController } from "./baseline.controller.js";
import { BaselineService } from "./baseline.service.js";

@Module({
  imports: [AuthModule],
  controllers: [BaselineController],
  providers: [BaselineService],
  exports: [BaselineService],
})
export class BaselineModule {}
