import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

@Module({
  imports: [IntegrationsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
