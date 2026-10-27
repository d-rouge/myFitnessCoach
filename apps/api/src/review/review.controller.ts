import type { User } from "@health-trainer/domain";
import { Controller, Get, NotFoundException, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ReviewService } from "./review.service.js";

@Controller("review")
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post("weekly")
  async computeWeeklyReview(@CurrentUser() user: User) {
    return this.reviewService.computeWeeklyReview(user.id);
  }

  @Get("latest")
  async getLatestReview(@CurrentUser() user: User) {
    const review = await this.reviewService.getLatestReview(user.id);
    if (!review) {
      throw new NotFoundException("Nessuna review disponibile.");
    }
    return review;
  }

  @Post("advance-week")
  async advanceWeek(@CurrentUser() user: User) {
    return this.reviewService.advanceWeek(user.id);
  }
}
