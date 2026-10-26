import { Module } from "@nestjs/common";
import { DevOnlyGuard } from "./dev-only.guard.js";
import { GarminService } from "./garmin.service.js";
import { GarminSyncService } from "./garmin-sync.service.js";
import { IntegrationsController } from "./integrations.controller.js";
import { YazioService } from "./yazio.service.js";
import { YazioSyncService } from "./yazio-sync.service.js";

@Module({
  controllers: [IntegrationsController],
  providers: [GarminService, GarminSyncService, YazioService, YazioSyncService, DevOnlyGuard],
  exports: [GarminService, GarminSyncService, YazioService, YazioSyncService],
})
export class IntegrationsModule {}
