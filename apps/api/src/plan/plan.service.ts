import {
  getCurrentBaseline,
  getCurrentMacroPlan,
  getCurrentMicroPlan,
  saveMacroPlan,
  saveMicroPlan,
  updatePlannedSession,
} from "@health-trainer/db";
import {
  generateMacroPlan,
  generateMicroPlan,
  type MacroPlan,
  type MicroPlan,
  type PlannedSession,
  type SessionAlternative,
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
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(private readonly mongo: MongoService) {}

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async getMacroPlan(userId: string): Promise<MacroPlan | null> {
    const db = await this.db();
    return getCurrentMacroPlan(db, userId);
  }

  async generateMacroPlan(
    userId: string,
    options?: { startDate?: string; totalWeeks?: number },
  ): Promise<{ macroPlan: MacroPlan; microPlan: MicroPlan }> {
    const db = await this.db();
    const baseline = await getCurrentBaseline(db, userId);
    if (!baseline) {
      throw new BadRequestException(
        "Nessuna baseline attiva trovata. Completa prima l'onboarding per generare il piano.",
      );
    }

    const macroPlan = generateMacroPlan(baseline, options);
    await saveMacroPlan(db, userId, macroPlan);

    // Also automatically generate and save Week 1 MicroPlan
    const microPlan = generateMicroPlan(baseline, macroPlan, 1, {
      startDate: macroPlan.startDate,
    });
    await saveMicroPlan(db, userId, microPlan);

    this.logger.log(
      `Generato macro-piano ${macroPlan.id} (${macroPlan.totalWeeks} settimane) e micro-piano settimanale per atleta ${userId}`,
    );

    return { macroPlan, microPlan };
  }

  async getMicroPlan(userId: string, weekIndex?: number): Promise<MicroPlan | null> {
    const db = await this.db();
    return getCurrentMicroPlan(db, userId, weekIndex);
  }

  async generateMicroPlan(userId: string, weekIndex: number): Promise<MicroPlan> {
    const db = await this.db();
    const baseline = await getCurrentBaseline(db, userId);
    if (!baseline) {
      throw new BadRequestException("Nessuna baseline attiva trovata.");
    }

    const macroPlan = await getCurrentMacroPlan(db, userId);
    if (!macroPlan) {
      throw new BadRequestException(
        "Nessun macro-piano attivo trovato. Genera prima il macro-piano.",
      );
    }

    const microPlan = generateMicroPlan(baseline, macroPlan, weekIndex);
    await saveMicroPlan(db, userId, microPlan);

    this.logger.log(`Generato micro-piano per settimana ${weekIndex} (atleta ${userId})`);

    return microPlan;
  }

  async getTodaySession(userId: string): Promise<{
    today: string;
    session: PlannedSession | null;
    alternatives: SessionAlternative[];
    microPlanId?: string;
    isRestDay: boolean;
  }> {
    const db = await this.db();
    const today = new Date().toISOString().slice(0, 10);

    const microPlan = await getCurrentMicroPlan(db, userId);
    if (!microPlan) {
      return {
        today,
        session: null,
        alternatives: [],
        isRestDay: true,
      };
    }

    const session = microPlan.sessions.find((s) => s.date === today) ?? null;

    return {
      today,
      session,
      alternatives: session?.alternatives ?? [],
      microPlanId: microPlan.id,
      isRestDay: session === null,
    };
  }

  async updateSession(
    userId: string,
    sessionId: string,
    patch: {
      status?: "planned" | "completed" | "skipped" | "adjusted";
      notes?: string;
    },
  ): Promise<{ success: boolean }> {
    const db = await this.db();
    const updated = await updatePlannedSession(db, userId, sessionId, patch);
    if (!updated) {
      throw new NotFoundException(`Sessione ${sessionId} non trovata.`);
    }
    return { success: true };
  }
}
