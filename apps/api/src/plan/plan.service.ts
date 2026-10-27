import {
  getActivitiesForCapacity,
  getCurrentBaseline,
  getCurrentMacroPlan,
  getCurrentMicroPlan,
  replacePlannedSession,
  saveMacroPlan,
  saveMicroPlan,
  supersedeMacroPlans,
  updatePlannedSession,
} from "@health-trainer/db";
import {
  assessSafety,
  type Baseline,
  buildRecentContext,
  generateMacroPlan,
  generateMicroPlan,
  type MacroPlan,
  type MicroPlan,
  type PlannedSession,
  PlannedSessionSchema,
  type RecentContext,
  type SessionAlternative,
  toCapacityActivity,
  todayLocalDate,
  withDerivedExperienceTier,
} from "@health-trainer/domain";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Db } from "mongodb";
import { withMeasuredCapacity } from "../baseline/measured-capacity.js";
import { getUserTimeZone } from "../common/user-timezone.js";
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

  /**
   * Reads the stored baseline together with the imported activities.
   *
   * Two things are refreshed here, never at onboarding time only: the current
   * capacity (so a `garmin` baseline always plans on fresh data) and the
   * recent context (race/long effort, load spike). The context is passed both
   * to the deterministic guard and to the future LLM layer as base data.
   */
  private async enrichBaseline(
    db: Db,
    stored: Baseline,
  ): Promise<{ baseline: Baseline; recentContext: RecentContext }> {
    // Documents saved before the v2 model have no `capacity`/`history`.
    // Normalize first: the provenance lookup below would read `undefined`.
    const normalized = withDerivedExperienceTier(stored);
    const activities = await getActivitiesForCapacity(db, normalized.userId);
    const now = new Date().toISOString();
    const recentContext = buildRecentContext(activities, {
      now,
      timezone: normalized.profile.timezone,
    });

    // Same rule the API uses on read: `garmin` and `calibration` are measured
    // from the activities, `manual` is left alone.
    return {
      baseline: withMeasuredCapacity(normalized, activities.map(toCapacityActivity), now),
      recentContext,
    };
  }

  private badRequestFrom(error: unknown): BadRequestException {
    return new BadRequestException(error instanceof Error ? error.message : String(error));
  }

  /**
   * Safety gate for plan generation. Absolute red flags and a missing PAR-Q
   * clearance stop the generator before any plan is written.
   */
  private assertSafeToPlan(baseline: Baseline): void {
    const safety = assessSafety({ anamnesis: baseline.anamnesis });

    if (safety.severity === "block") {
      throw new BadRequestException(
        `Generazione del piano bloccata per motivi di sicurezza: ${safety.reasons.join("; ")}. Consulta un medico prima di procedere.`,
      );
    }

    if (safety.requiresMedicalClearance) {
      throw new BadRequestException(
        "Idoneità medica richiesta: completa il PAR-Q o ottieni il nullaosta medico prima di generare il piano.",
      );
    }
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
    const stored = await getCurrentBaseline(db, userId);
    if (!stored) {
      throw new BadRequestException(
        "Nessuna baseline attiva trovata. Completa prima l'onboarding per generare il piano.",
      );
    }
    const { baseline, recentContext } = await this.enrichBaseline(db, stored);

    this.assertSafeToPlan(baseline);

    let macroPlan: MacroPlan;
    let microPlan: MicroPlan;
    try {
      macroPlan = generateMacroPlan(baseline, { ...options, recentContext });
      // Also automatically generate and save Week 1 MicroPlan
      microPlan = generateMicroPlan(baseline, macroPlan, 1, {
        startDate: macroPlan.startDate,
      });
    } catch (error) {
      throw this.badRequestFrom(error);
    }

    await saveMacroPlan(db, userId, macroPlan);
    await saveMicroPlan(db, userId, microPlan);
    // Regenerating replaces the previous plan: two plans with the same
    // `startDate` would make `getCurrentMacroPlan` non-deterministic.
    await supersedeMacroPlans(db, userId, macroPlan.id);

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
    const stored = await getCurrentBaseline(db, userId);
    if (!stored) {
      throw new BadRequestException("Nessuna baseline attiva trovata.");
    }
    const { baseline } = await this.enrichBaseline(db, stored);

    const macroPlan = await getCurrentMacroPlan(db, userId);
    if (!macroPlan) {
      throw new BadRequestException(
        "Nessun macro-piano attivo trovato. Genera prima il macro-piano.",
      );
    }

    this.assertSafeToPlan(baseline);

    let microPlan: MicroPlan;
    try {
      microPlan = generateMicroPlan(baseline, macroPlan, weekIndex);
    } catch (error) {
      throw this.badRequestFrom(error);
    }
    await saveMicroPlan(db, userId, microPlan);

    this.logger.log(`Generato micro-piano per settimana ${weekIndex} (atleta ${userId})`);

    return microPlan;
  }

  async getTodaySession(userId: string): Promise<{
    today: string;
    timeZone: string;
    session: PlannedSession | null;
    alternatives: SessionAlternative[];
    microPlanId?: string;
    isRestDay: boolean;
  }> {
    const db = await this.db();
    const timeZone = await getUserTimeZone(db, userId);
    const today = todayLocalDate(timeZone);

    const microPlan = await getCurrentMicroPlan(db, userId);
    if (!microPlan) {
      return {
        today,
        timeZone,
        session: null,
        alternatives: [],
        isRestDay: true,
      };
    }

    const session = microPlan.sessions.find((s) => s.date === today) ?? null;

    return {
      today,
      timeZone,
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
    const microPlan = await getCurrentMicroPlan(db, userId);
    const existing = microPlan?.sessions.find((session) => session.id === sessionId);
    if (!existing) {
      throw new NotFoundException(`Sessione ${sessionId} non trovata.`);
    }

    const merged = PlannedSessionSchema.safeParse({ ...existing, ...patch });
    if (!merged.success) {
      const details = merged.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new BadRequestException(`Sessione non valida: ${details}`);
    }

    const updated = await updatePlannedSession(db, userId, sessionId, patch);
    if (!updated) {
      throw new NotFoundException(`Sessione ${sessionId} non trovata.`);
    }
    return { success: true };
  }

  /**
   * Persists a full session produced by the daily adjustment engine.
   * Manual notes and identity fields are preserved.
   */
  async applyAdjustment(
    userId: string,
    sessionId: string,
    adjustedSession: PlannedSession,
  ): Promise<{ success: boolean }> {
    const db = await this.db();
    const microPlan = await getCurrentMicroPlan(db, userId);
    const existing = microPlan?.sessions.find((session) => session.id === sessionId);
    if (!existing) {
      throw new NotFoundException(`Sessione ${sessionId} non trovata.`);
    }

    const merged = PlannedSessionSchema.safeParse({
      ...existing,
      ...adjustedSession,
      id: existing.id,
      date: existing.date,
      status: "adjusted",
    });
    if (!merged.success) {
      const details = merged.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new BadRequestException(`Sessione adattata non valida: ${details}`);
    }

    const updated = await replacePlannedSession(db, userId, sessionId, merged.data);
    if (!updated) {
      throw new NotFoundException(`Sessione ${sessionId} non trovata.`);
    }

    this.logger.log(
      `Sessione ${sessionId} adattata per atleta ${userId} (${merged.data.durationMin} min, RPE ${merged.data.intensity.rpe ?? "-"})`,
    );
    return { success: true };
  }
}
