import {
  getActivitiesForCapacity,
  getBaselineHistory,
  getCurrentBaseline,
  saveBaseline,
} from "@health-trainer/db";
import {
  AnamnesisSchema,
  assessSafety,
  type Baseline,
  BaselineSchema,
  type CapacityEstimate,
  estimateCapacityFromActivities,
  type FiveKProjection,
  type FiveKProjectionInput,
  primarySportOf,
  project5k,
  type SafetyAssessment,
  toCapacityActivity,
  withDerivedExperienceTier,
} from "@health-trainer/domain";
import {
  BadRequestException,
  Injectable,
  Logger,
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

    const normalized = withDerivedExperienceTier(baseline);
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
      profile = { ...profile, capacity: estimate.capacity };
    }

    // The tier is derived, never trusted from the client: this is the single
    // place where current capacity (starting load) and past history
    // (progression speed) are combined.
    const data = withDerivedExperienceTier({
      ...parsed.data,
      profile,
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

  evaluate5kFeasibility(input: FiveKProjectionInput): FiveKProjection {
    try {
      return project5k(input);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
