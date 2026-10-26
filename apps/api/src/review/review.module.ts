import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { ReviewController } from "./review.controller.js";
import { ReviewService } from "./review.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
