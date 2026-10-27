import {
  getActivitiesForCapacity,
  getCheckinsInRange,
  getCurrentBaseline,
  getCurrentMacroPlan,
  getRecentMicroPlans,
} from "@health-trainer/db";
import {
  type AthleteDossier,
  type Baseline,
  buildAthleteDossier,
  toCapacityActivity,
  withDerivedExperienceTier,
} from "@health-trainer/domain";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { withMeasuredCapacity } from "../baseline/measured-capacity.js";
import { MongoService } from "../database/mongo.service.js";

@Injectable()
export class AthleteService {
  constructor(private readonly mongo: MongoService) {}

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /**
   * Unico punto di raccolta del contesto: baseline normalizzata e con capacità
   * misurata, più il dossier. Lo usano generazione del piano e coach, così non
   * esistono due percorsi di contesto divergenti.
   *
   * Restituisce `null` quando manca la baseline: il chiamante deve rispondere
   * 404, non un dossier vuoto.
   */
  async getContext(
    userId: string,
  ): Promise<{ baseline: Baseline; dossier: AthleteDossier } | null> {
    const db = await this.db();
    const stored = await getCurrentBaseline(db, userId);
    if (!stored) return null;

    const now = new Date().toISOString();
    const windowStart = new Date(now);
    windowStart.setUTCDate(windowStart.getUTCDate() - 90);

    const [activities, checkins, macroPlan, microPlans] = await Promise.all([
      getActivitiesForCapacity(db, userId),
      getCheckinsInRange(db, userId, windowStart.toISOString().slice(0, 10), now.slice(0, 10)),
      getCurrentMacroPlan(db, userId),
      getRecentMicroPlans(db, userId, 6),
    ]);

    const normalized = withDerivedExperienceTier(stored);
    const baseline = withMeasuredCapacity(normalized, activities.map(toCapacityActivity), now);

    const dossier = buildAthleteDossier({
      baseline,
      activities,
      checkins,
      macroPlan,
      microPlans,
      now,
    });

    return { baseline, dossier };
  }

  async getDossier(userId: string): Promise<AthleteDossier | null> {
    const context = await this.getContext(userId);
    return context?.dossier ?? null;
  }
}
