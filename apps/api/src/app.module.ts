import { Module } from "@nestjs/common";
import { ActivityModule } from "./activity/activity.module.js";
import { AiModule } from "./ai/ai.module.js";
import { AthleteModule } from "./athlete/athlete.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { BaselineModule } from "./baseline/baseline.module.js";
import { CheckinModule } from "./checkin/checkin.module.js";
import { EnvModule } from "./config/env.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { ExportModule } from "./export/export.module.js";
import { HealthModule } from "./health/health.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { PlanModule } from "./plan/plan.module.js";
import { ReviewModule } from "./review/review.module.js";

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    HealthModule,
    IntegrationsModule,
    ExportModule,
    AuthModule,
    BaselineModule,
    AthleteModule,
    PlanModule,
    CheckinModule,
    ReviewModule,
    ActivityModule,
    AiModule,
  ],
})
export class AppModule {}
