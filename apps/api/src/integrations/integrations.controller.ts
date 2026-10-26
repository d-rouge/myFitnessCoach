import { BadRequestException, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { DevOnlyGuard } from "./dev-only.guard.js";
import { GarminService } from "./garmin.service.js";
import { GarminSyncService } from "./garmin-sync.service.js";
import { YazioService } from "./yazio.service.js";
import { YazioSyncService } from "./yazio-sync.service.js";

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
    private readonly yazio: YazioService,
    private readonly yazioSync: YazioSyncService,
  ) {}

  @Get("status")
  status() {
    return {
      garmin: { configured: this.garmin.isConfigured() },
      yazio: { configured: this.yazio.isConfigured() },
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

  @Post("yazio/check")
  @UseGuards(DevOnlyGuard)
  checkYazio() {
    return this.yazio.check();
  }

  @Get("yazio/overview")
  @UseGuards(DevOnlyGuard)
  yazioOverview(@Query("days") days?: string) {
    return this.yazioSync.overview(parseDays(days));
  }

  @Post("yazio/sync")
  @UseGuards(DevOnlyGuard)
  syncYazio(@Query("days") days?: string) {
    return this.yazioSync.sync(parseDays(days));
  }
}
