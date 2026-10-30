import {
  getCheckinsInRange,
  getCurrentBaseline,
  getCurrentMacroPlan,
  getCurrentMicroPlan,
  getLatestReview,
  getReviewForWeek,
  saveMicroPlan,
  saveReview,
} from "@health-trainer/db";
import {
  computeWeeklyReview,
  generateMicroPlan,
  type MethodologyReview,
  type MicroPlan,
  type Review,
  type ReviewDecision,
} from "@health-trainer/domain";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MongoService } from "../database/mongo.service.js";
import { MethodologyService } from "../plan/methodology.service.js";

const PROGRESS_FACTOR = 1.1;
const DELOAD_FACTOR = 0.7;

/** Età massima della metodologia prima di rifarla alla review. */
const METHODOLOGY_MAX_AGE_PROGRESS_DAYS = 6;
const METHODOLOGY_MAX_AGE_ALERT_DAYS = 3;

/**
 * Applies the weekly verdict to the generated next microcycle. The generator
 * is deterministic; progression/deload are explicit post-processing steps.
 */
export function applyReviewDecision(plan: MicroPlan, decision: ReviewDecision): MicroPlan {
  if (decision === "deload") {
    plan.deload = true;
    plan.focus = "Settimana di scarico e recupero articolare";
    scaleVolume(plan, DELOAD_FACTOR, { reduceRpe: true });
    return plan;
  }

  if (decision === "progress") {
    plan.deload = false;
    scaleVolume(plan, PROGRESS_FACTOR);
  }

  return plan;
}

function scaleVolume(plan: MicroPlan, factor: number, options: { reduceRpe?: boolean } = {}): void {
  for (const session of plan.sessions) {
    if (session.type === "mobility" || session.type === "recovery") continue;

    session.durationMin = Math.max(15, Math.round(session.durationMin * factor));
    if (options.reduceRpe && session.intensity.rpe) {
      session.intensity.rpe = Math.max(2, session.intensity.rpe - 2);
    }
  }

  plan.weeklyVolumeMin = plan.sessions.reduce((total, session) => total + session.durationMin, 0);
  if (plan.targetLoad !== undefined) {
    plan.targetLoad = Math.round(plan.targetLoad * factor);
  }
}

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly mongo: MongoService,
    @Optional() private readonly methodology?: MethodologyService,
  ) {}

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

    // Only the check-ins belonging to the reviewed week can influence it.
    const checkins = await getCheckinsInRange(db, userId, microPlan.startDate, microPlan.endDate);
    const review = computeWeeklyReview({
      userId,
      microPlan,
      checkins,
    });

    // La review è anche il punto in cui la metodologia viene ricontrollata con
    // i dati nuovi. Se il modello è giù, la review resta valida: il controllo
    // è un extra, non un prerequisito.
    const methodologyReview = await this.refreshMethodology(userId, review);
    if (methodologyReview) {
      review.methodologyReview = methodologyReview;
      if (methodologyReview.refreshed) {
        review.nextCycleRecommendations = [
          ...review.nextCycleRecommendations,
          `Metodologia rivalutata: ${methodologyReview.methodology}. Valuta di rigenerare il piano con la nuova struttura.`,
        ];
      }
    }

    await saveReview(db, userId, review);
    this.logger.log(
      `Review settimanale calcolata e salvata per atleta ${userId}: verdetto ${review.decision}`,
    );
    return review;
  }

  private async refreshMethodology(
    userId: string,
    review: Review,
  ): Promise<MethodologyReview | null> {
    if (!this.methodology) return null;

    const maxAgeDays =
      review.decision === "progress"
        ? METHODOLOGY_MAX_AGE_PROGRESS_DAYS
        : METHODOLOGY_MAX_AGE_ALERT_DAYS;

    try {
      const { evaluation, refreshed } = await this.methodology.reevaluateIfStale(
        userId,
        maxAgeDays,
      );
      if (!evaluation) return null;
      if (refreshed) {
        this.logger.log(
          `Metodologia rivalutata dalla review per atleta ${userId}: ${evaluation.decision.methodology}`,
        );
      }
      return {
        refreshed,
        decisionId: evaluation.id,
        methodology: evaluation.decision.methodology,
        confidence: evaluation.decision.confidence,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(
        `Rivalutazione metodologia fallita per atleta ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
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
    if (!currentMicro) {
      throw new BadRequestException(
        "Nessun micro-piano attivo trovato. Genera prima la settimana corrente.",
      );
    }

    if (currentMicro.weekIndex >= macroPlan.totalWeeks) {
      throw new BadRequestException(
        `Il macrociclo è completo (settimana ${currentMicro.weekIndex}/${macroPlan.totalWeeks}). Genera un nuovo macrociclo per continuare.`,
      );
    }

    const nextWeekIndex = currentMicro.weekIndex + 1;

    // Use the review of the current week only; never advance on a stale review.
    let review = await getReviewForWeek(db, userId, currentMicro.startDate, currentMicro.endDate);
    if (!review) {
      review = await this.computeWeeklyReview(userId);
    }

    let nextMicroPlan: MicroPlan;
    try {
      nextMicroPlan = generateMicroPlan(baseline, macroPlan, nextWeekIndex);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }

    applyReviewDecision(nextMicroPlan, review.decision);

    await saveMicroPlan(db, userId, nextMicroPlan);
    this.logger.log(
      `Avanzamento a settimana ${nextWeekIndex} (${review.decision}) completato per atleta ${userId}`,
    );

    return { review, nextMicroPlan };
  }
}
