import type { User } from "@health-trainer/domain";
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  type ActivityHistoryQuery,
  ActivityHistoryQuerySchema,
  type ManualActivityInput,
  ManualActivitySchema,
  type UploadFitInput,
  UploadFitSchema,
} from "./activity.schemas.js";
import { ActivityService } from "./activity.service.js";

@Controller("activities")
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Post("manual")
  async recordManual(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(ManualActivitySchema)) body: ManualActivityInput,
  ) {
    return this.activityService.recordManualActivity(user.id, body);
  }

  @Post("upload-fit")
  async uploadFit(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(UploadFitSchema)) body: UploadFitInput,
  ) {
    const buffer = Buffer.from(body.base64, "base64");
    return this.activityService.recordFitUpload(
      user.id,
      new Uint8Array(buffer),
      body.filename || "workout.fit",
    );
  }

  @Get("history")
  async getHistory(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(ActivityHistoryQuerySchema)) query: ActivityHistoryQuery,
  ) {
    return this.activityService.getRecentActivities(user.id, query.limit);
  }
}
