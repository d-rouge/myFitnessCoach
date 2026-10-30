import {
  getActivitiesForCapacity,
  getBaselineHistory,
  getCurrentBaseline,
  getCurrentMacroPlan,
  getMicroPlansByMacroPlan,
  saveBaseline,
} from "@health-trainer/db";
import {
  type Activity,
  AnamnesisSchema,
  assessSafety,
  type Baseline,
  BaselineSchema,
  type CapacityEstimate,
  estimateCapacityFromActivities,
  estimateFiveKFeasibility,
  type FiveKFeasibility,
  type MicroPlan,
  normalizeAvailability,
  preserveDeclaredFiveK,
  primarySportOf,
  type SafetyAssessment,
  toCapacityActivity,
  withDerivedExperienceTier,
  withInferredGoalTypes,
} from "@health-trainer/domain";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MongoService } from "../database/mongo.service.js";
import { withMeasuredCapacity } from "./measured-capacity.js";

const SaveBaselineInputSchema = BaselineSchema.omit({
  id: true,
  userId: true,
  version: true,
  validFrom: true,
  supersededAt: true,
});

@Injectable()
export class BaselineService {
  private readonly logger = new Logger(BaselineService.name);

  constructor(private readonly mongo: MongoService) {}

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /**
   * Current baseline, already normalized and with capacity measured from the
   * imported activities when the declared source asks for it. Reading it here
   * means the dashboard and the wizard never show stale zeros.
   */
  async getCurrent(userId: string): Promise<Baseline | null> {
    const db = await this.db();
    const baseline = await getCurrentBaseline(db, userId);
    if (!baseline) return null;

    const normalized = withDerivedExperienceTier({
      ...baseline,
      goals: withInferredGoalTypes(baseline.goals),
      availability: normalizeAvailability(baseline.availability),
    });
    const activities = await getActivitiesForCapacity(db, userId);
    return withMeasuredCapacity(
      normalized,
      activities.map(toCapacityActivity),
      new Date().toISOString(),
    );
  }

  async getHistory(userId: string): Promise<Baseline[]> {
    const db = await this.db();
    const baselines = await getBaselineHistory(db, userId);
    return baselines.map((baseline) => withDerivedExperienceTier(baseline));
  }

  /**
   * Current capacity estimated from imported activities. Returns `available:
   * false` instead of throwing: the UI uses it to decide between showing the
   * measured numbers and asking a single question / starting with a
   * calibration week.
   */
  async estimateCapacity(userId: string): Promise<CapacityEstimate> {
    const db = await this.db();
    const [activities, baseline] = await Promise.all([
      getActivitiesForCapacity(db, userId),
      getCurrentBaseline(db, userId),
    ]);
    return estimateCapacityFromActivities(activities.map(toCapacityActivity), {
      now: new Date().toISOString(),
      sport: baseline ? primarySportOf(baseline) : "running",
      timezone: baseline?.profile.timezone,
    });
  }

  async save(userId: string, input: unknown): Promise<Baseline> {
    const parsed = SaveBaselineInputSchema.safeParse(input);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new BadRequestException(`Dati baseline non validi: ${details}`);
    }

    const db = await this.db();
    let profile = parsed.data.profile;

    // `garmin` is an intent, not a payload: measured values are recomputed
    // here so the client can never ship stale or invented capacity.
    if (profile.capacity.source === "garmin") {
      const estimate = await this.estimateCapacity(userId);
      if (!estimate.available) {
        throw new BadRequestException(
          "Nessuna attività importata trovata: inserisci la capacità manualmente o lascia la settimana di calibrazione.",
        );
      }
      // Il tempo 5K dichiarato (es. race prediction di Garmin Connect) non è
      // ricavabile dalle attività: il ricalcolo lo conserva, il resto dei campi
      // misurati viene aggiornato.
      profile = {
        ...profile,
        capacity: preserveDeclaredFiveK(estimate.capacity, profile.capacity),
      };
    }

    // The tier is derived, never trusted from the client: this is the single
    // place where current capacity (starting load) and past history
    // (progression speed) are combined. Anche il tipo di obiettivo è dedotto
    // dalla descrizione: non è una domanda da fare all'atleta.
    const data = withDerivedExperienceTier({
      ...parsed.data,
      profile,
      goals: withInferredGoalTypes(parsed.data.goals),
      availability: normalizeAvailability(parsed.data.availability),
      userId,
    });

    // Safety is always evaluated on save so the risk is recorded in logs and
    // surfaced by plan generation. Saving is allowed: the athlete must be able
    // to store red flags/injuries, and blocking here would make them lose data.
    const safety = assessSafety({ anamnesis: data.anamnesis });
    if (safety.severity === "block") {
      this.logger.warn(
        `Baseline con red flag per utente ${userId}: ${safety.reasons.join("; ")}. La generazione del piano sarà bloccata.`,
      );
    } else if (safety.requiresMedicalClearance) {
      this.logger.warn(
        `PAR-Q non superato per utente ${userId}: richiesta idoneità medica prima del piano.`,
      );
    }

    this.logger.log(`Salvataggio baseline per utente ${userId}`);
    return saveBaseline(db, data);
  }

  evaluateSafety(anamnesis: unknown): SafetyAssessment {
    const parsed = AnamnesisSchema.safeParse(anamnesis);
    if (!parsed.success) {
      throw new BadRequestException("Anamnesi non valida");
    }
    return assessSafety({ anamnesis: parsed.data });
  }

  /**
   * Fattibilità 5K calcolata sui dati reali dell'atleta: capacità misurata
   * sulle attività Garmin, volume di corsa delle ultime 4 settimane e data
   * obiettivo della baseline. Nessun input arriva dal client: i numeri non
   * possono essere inventati dalla UI. Il piano parte dalla prima seduta
   * completata: prima di allora non c'è storico e la stima non viene data.
   */
  async estimate5kFeasibility(userId: string): Promise<FiveKFeasibility> {
    const baseline = await this.getCurrent(userId);
    if (!baseline) {
      throw new NotFoundException("Nessuna baseline attiva trovata.");
    }

    const db = await this.db();
    const [activities, macroPlan] = await Promise.all([
      getActivitiesForCapacity(db, userId),
      getCurrentMacroPlan(db, userId),
    ]);
    // Solo le settimane del piano corrente: i piani sostituiti non contano.
    const microPlans = macroPlan ? await getMicroPlansByMacroPlan(db, userId, macroPlan.id) : [];

    return this.estimate5kFeasibilityFromData({
      baseline,
      activities,
      microPlans,
      planStartDate: macroPlan?.startDate ?? null,
      now: new Date().toISOString(),
    });
  }

  /** Variante pura, usata dai test e riutilizzabile senza DB. */
  estimate5kFeasibilityFromData(input: {
    baseline: Baseline;
    activities: readonly Activity[];
    microPlans: readonly MicroPlan[];
    planStartDate?: string | null;
    now: string;
  }): FiveKFeasibility {
    return estimateFiveKFeasibility({
      capacity: input.baseline.profile.capacity,
      tier: input.baseline.profile.experienceTier,
      targetDate: input.baseline.goals.primary.targetDate ?? null,
      activities: input.activities.map(toCapacityActivity),
      microPlans: input.microPlans,
      planStartDate: input.planStartDate ?? null,
      sport: primarySportOf(input.baseline),
      now: input.now,
      timezone: input.baseline.profile.timezone,
    });
  }
}
