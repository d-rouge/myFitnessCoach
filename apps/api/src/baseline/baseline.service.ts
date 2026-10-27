import { getBaselineHistory, getCurrentBaseline, saveBaseline } from "@health-trainer/db";
import {
  AnamnesisSchema,
  assessSafety,
  type Baseline,
  BaselineSchema,
  type FiveKProjection,
  type FiveKProjectionInput,
  project5k,
  type SafetyAssessment,
} from "@health-trainer/domain";
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MongoService } from "../database/mongo.service.js";

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

  async getCurrent(userId: string): Promise<Baseline | null> {
    const db = await this.db();
    return getCurrentBaseline(db, userId);
  }

  async getHistory(userId: string): Promise<Baseline[]> {
    const db = await this.db();
    return getBaselineHistory(db, userId);
  }

  async save(userId: string, input: unknown): Promise<Baseline> {
    const parsed = SaveBaselineInputSchema.safeParse(input);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new BadRequestException(`Dati baseline non validi: ${details}`);
    }

    const data = {
      ...parsed.data,
      userId,
    };

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

    const db = await this.db();
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
