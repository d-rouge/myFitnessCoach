import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { BaselineModule } from "./baseline/baseline.module.js";
import { CheckinModule } from "./checkin/checkin.module.js";
import { EnvModule } from "./config/env.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { ExportModule } from "./export/export.module.js";
import { HealthModule } from "./health/health.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { PlanModule } from "./plan/plan.module.js";

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    HealthModule,
    IntegrationsModule,
    ExportModule,
    AuthModule,
    BaselineModule,
    PlanModule,
    CheckinModule,
  ],
})
export class AppModule {}
