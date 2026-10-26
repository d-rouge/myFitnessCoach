import { Module } from "@nestjs/common";
import { DevOnlyGuard } from "./dev-only.guard.js";
import { GarminService } from "./garmin.service.js";
import { GarminSyncService } from "./garmin-sync.service.js";
import { IntegrationsController } from "./integrations.controller.js";

@Module({
  controllers: [IntegrationsController],
  providers: [GarminService, GarminSyncService, DevOnlyGuard],
  exports: [GarminService, GarminSyncService],
})
export class IntegrationsModule {}
