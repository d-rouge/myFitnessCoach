import { Controller, Get, Headers, Post } from "@nestjs/common";
import { ReviewService } from "./review.service.js";

function resolveUserId(headerUserId?: string): string {
  return headerUserId?.trim() ? headerUserId.trim() : "user_marco";
}

@Controller("review")
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post("weekly")
  async computeWeeklyReview(@Headers("x-user-id") headerUserId?: string) {
    const userId = resolveUserId(headerUserId);
    return this.reviewService.computeWeeklyReview(userId);
  }

  @Get("latest")
  async getLatestReview(@Headers("x-user-id") headerUserId?: string) {
    const userId = resolveUserId(headerUserId);
    return this.reviewService.getLatestReview(userId);
  }

  @Post("advance-week")
  async advanceWeek(@Headers("x-user-id") headerUserId?: string) {
    const userId = resolveUserId(headerUserId);
    return this.reviewService.advanceWeek(userId);
  }
}
