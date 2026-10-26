import type { Sport } from "@health-trainer/domain";
import { BadRequestException, Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
import { ActivityService } from "./activity.service.js";

function resolveUserId(headerUserId?: string): string {
  return headerUserId?.trim() ? headerUserId.trim() : "user_marco";
}

interface ManualActivityDto {
  sessionId?: string;
  sport?: Sport;
  durationMin: number;
  distanceKm?: number;
  avgHr?: number;
  maxHr?: number;
  rpe?: number;
  notes?: string;
  date?: string;
}

interface UploadFitDto {
  base64: string;
  filename?: string;
}

@Controller("activities")
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Post("manual")
  async recordManual(@Body() body: ManualActivityDto, @Headers("x-user-id") headerUserId?: string) {
    const userId = resolveUserId(headerUserId);
    return this.activityService.recordManualActivity(userId, body);
  }

  @Post("upload-fit")
  async uploadFit(@Body() body: UploadFitDto, @Headers("x-user-id") headerUserId?: string) {
    if (!body?.base64) {
      throw new BadRequestException("Payload non valido: campo 'base64' obbligatorio.");
    }
    const userId = resolveUserId(headerUserId);
    const buffer = Buffer.from(body.base64, "base64");
    return this.activityService.recordFitUpload(
      userId,
      new Uint8Array(buffer),
      body.filename || "workout.fit",
    );
  }

  @Get("history")
  async getHistory(@Headers("x-user-id") headerUserId?: string, @Query("limit") limit?: string) {
    const userId = resolveUserId(headerUserId);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 10;
    return this.activityService.getRecentActivities(userId, parsedLimit);
  }
}
