import type { ActivityAnalysis } from "@health-trainer/domain";
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
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
  garminOverview(@CurrentUser() user: { id: string }, @Query("days") days?: string) {
    return this.garminSync.overview(user.id, parseDays(days));
  }

  @Post("garmin/sync")
  @UseGuards(DevOnlyGuard)
  syncGarmin(@CurrentUser() user: { id: string }, @Query("days") days?: string) {
    return this.garminSync.sync(user.id, parseDays(days));
  }

  @Post("garmin/activities/:activityId/analyze")
  @UseGuards(DevOnlyGuard)
  async analyzeGarminActivity(
    @CurrentUser() user: { id: string },
    @Param("activityId") activityId: string,
  ) {
    return this.toAnalysisDto(await this.garminSync.analyzeActivity(user.id, activityId));
  }

  @Get("garmin/activities/:activityId/analysis")
  @UseGuards(DevOnlyGuard)
  async getGarminActivityAnalysis(
    @CurrentUser() user: { id: string },
    @Param("activityId") activityId: string,
  ) {
    const analysis = await this.garminSync.getActivityAnalysis(user.id, activityId);
    if (!analysis) throw new NotFoundException("Activity analysis not found");
    return this.toAnalysisDto(analysis);
  }

  private toAnalysisDto(analysis: ActivityAnalysis) {
    return {
      externalId: analysis.externalId,
      sport: analysis.sport,
      date: analysis.date,
      summary: analysis.summary,
      derived: analysis.derived,
      hrZones: analysis.hrZones,
      lapsCount: analysis.laps.length,
      splitsCount: analysis.splits.length,
      brief: analysis.brief,
    };
  }

  @Post("yazio/check")
  @UseGuards(DevOnlyGuard)
  checkYazio() {
    return this.yazio.check();
  }

  @Get("yazio/overview")
  @UseGuards(DevOnlyGuard)
  yazioOverview(@CurrentUser() user: { id: string }, @Query("days") days?: string) {
    return this.yazioSync.overview(user.id, parseDays(days));
  }

  @Post("yazio/sync")
  @UseGuards(DevOnlyGuard)
  syncYazio(@CurrentUser() user: { id: string }, @Query("days") days?: string) {
    return this.yazioSync.sync(user.id, parseDays(days));
  }
}
