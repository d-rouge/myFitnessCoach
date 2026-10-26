import {
  getCurrentBaseline,
  getCurrentMacroPlan,
  getCurrentMicroPlan,
  getLatestReview,
  getRecentCheckins,
  saveMicroPlan,
  saveReview,
} from "@health-trainer/db";
import {
  computeWeeklyReview,
  generateMicroPlan,
  type MicroPlan,
  type Review,
} from "@health-trainer/domain";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MongoService } from "../database/mongo.service.js";

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(private readonly mongo: MongoService) {}

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async computeWeeklyReview(userId: string): Promise<Review> {
    const db = await this.db();
    const microPlan = await getCurrentMicroPlan(db, userId);
    if (!microPlan) {
      throw new NotFoundException("Nessun piano settimanale attivo trovato da valutare.");
    }

    const checkins = await getRecentCheckins(db, userId, 14);
    const review = computeWeeklyReview({
      userId,
      microPlan,
      checkins,
    });

    await saveReview(db, userId, review);
    this.logger.log(
      `Review settimanale calcolata e salvata per atleta ${userId}: verdetto ${review.decision}`,
    );
    return review;
  }

  async getLatestReview(userId: string): Promise<Review | null> {
    const db = await this.db();
    return getLatestReview(db, userId);
  }

  async advanceWeek(userId: string): Promise<{ review: Review; nextMicroPlan: MicroPlan }> {
    const db = await this.db();
    const baseline = await getCurrentBaseline(db, userId);
    if (!baseline) {
      throw new BadRequestException("Nessuna baseline attiva trovata.");
    }

    const macroPlan = await getCurrentMacroPlan(db, userId);
    if (!macroPlan) {
      throw new BadRequestException("Nessun macro-piano attivo trovato.");
    }

    const currentMicro = await getCurrentMicroPlan(db, userId);
    const currentWeekIndex = currentMicro ? currentMicro.weekIndex : 1;
    const nextWeekIndex = currentWeekIndex >= macroPlan.totalWeeks ? 1 : currentWeekIndex + 1;

    let latest = await getLatestReview(db, userId);
    if (!latest) {
      latest = await this.computeWeeklyReview(userId);
    }

    const nextMicroPlan = generateMicroPlan(baseline, macroPlan, nextWeekIndex);
    if (latest.decision === "deload") {
      nextMicroPlan.deload = true;
      nextMicroPlan.focus = "Settimana di scarico e recupero articolare";
      for (const sess of nextMicroPlan.sessions) {
        if (sess.type !== "mobility" && sess.type !== "recovery") {
          sess.durationMin = Math.max(15, Math.round(sess.durationMin * 0.7));
          if (sess.intensity.rpe) {
            sess.intensity.rpe = Math.max(2, sess.intensity.rpe - 2);
          }
        }
      }
    }

    await saveMicroPlan(db, userId, nextMicroPlan);
    this.logger.log(`Avanzamento a settimana ${nextWeekIndex} completato per atleta ${userId}`);

    return { review: latest, nextMicroPlan };
  }
}
