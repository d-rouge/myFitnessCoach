import { Module } from "@nestjs/common";
import { EnvModule } from "./config/env.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";

@Module({
  imports: [EnvModule, DatabaseModule, HealthModule, IntegrationsModule],
})
export class AppModule {}
