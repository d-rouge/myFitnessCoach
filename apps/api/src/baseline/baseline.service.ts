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
