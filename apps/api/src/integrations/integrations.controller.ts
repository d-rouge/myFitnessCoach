import { BadRequestException, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { DevOnlyGuard } from "./dev-only.guard.js";
import { GarminService } from "./garmin.service.js";
import { GarminSyncService } from "./garmin-sync.service.js";

function parseDays(value?: string): number {
  if (value === undefined) return 7;
  const days = Number.parseInt(value, 10);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new BadRequestException("days must be an integer between 1 and 30");
  }
  return days;
}

@Controller("integrations")
export class IntegrationsController {
  constructor(
    private readonly garmin: GarminService,
    private readonly garminSync: GarminSyncService,
  ) {}

  @Get("status")
  status() {
    return {
      garmin: { configured: this.garmin.isConfigured() },
    };
  }

  @Post("garmin/check")
  @UseGuards(DevOnlyGuard)
  checkGarmin() {
    return this.garmin.check();
  }

  @Get("garmin/overview")
  @UseGuards(DevOnlyGuard)
  garminOverview(@Query("days") days?: string) {
    return this.garminSync.overview(parseDays(days));
  }

  @Post("garmin/sync")
  @UseGuards(DevOnlyGuard)
  syncGarmin(@Query("days") days?: string) {
    return this.garminSync.sync(parseDays(days));
  }
}
