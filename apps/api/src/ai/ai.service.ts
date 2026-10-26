import {
  COACH_PROMPT_VERSION,
  CoachAdviceSchema,
  createAiRunRecord,
  DeterministicCoachProvider,
} from "@health-trainer/ai";
import { getCurrentBaseline, getCurrentMicroPlan, getRecentCheckins } from "@health-trainer/db";
import type { PlannedSession } from "@health-trainer/domain";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MongoService } from "../database/mongo.service.js";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider = new DeterministicCoachProvider();

  constructor(private readonly mongo: MongoService) {}

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async getCoachAdvice(userId: string, sessionId?: string) {
    const startTime = Date.now();
    const db = await this.db();
    const baseline = await getCurrentBaseline(db, userId);
    const microPlan = await getCurrentMicroPlan(db, userId);

    if (!microPlan || microPlan.sessions.length === 0) {
      throw new NotFoundException("Nessun piano di allenamento attivo trovato.");
    }

    let session: PlannedSession | undefined;
    if (sessionId) {
      session = microPlan.sessions.find((s) => s.id === sessionId);
    }
    if (!session) {
      session = microPlan.sessions.find((s) => s.status !== "completed") ?? microPlan.sessions[0];
    }

    if (!session) {
      throw new BadRequestException("Nessuna sessione trovata per generare consigli.");
    }

    // Check recent checkin
    const recentCheckins = await getRecentCheckins(db, userId, 2);
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCheckin = recentCheckins.find((c) => c.date === todayStr);

    const athleteName = baseline?.userId ? `Atleta` : "Atleta";
    const tone = baseline?.profile?.tone || "supportive";
    const injuryAlerts =
      baseline?.anamnesis?.injuries
        ?.filter((i) => i.status === "acute" || i.status === "recovering" || i.status === "chronic")
        .map((i) => `${i.area} (dolore ${i.painLevel}/10)`) ?? [];

    const promptPayload = {
      athleteName,
      tone,
      session,
      checkin: todayCheckin ?? null,
      readinessBand:
        todayCheckin && (todayCheckin.energy ?? 3) <= 2
          ? ("impaired" as const)
          : ("optimal" as const),
      injuryAlerts,
    };

    const response = await this.provider.generate({
      task: "daily",
      system: "coach",
      user: JSON.stringify(promptPayload),
      schema: CoachAdviceSchema,
    });

    const latencyMs = Date.now() - startTime;
    const runRecord = createAiRunRecord({
      userId,
      task: "daily_coach",
      promptVersion: COACH_PROMPT_VERSION,
      provider: response.provider,
      model: response.model,
      latencyMs,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costUsd: response.usage.costUsd,
      success: true,
    });

    try {
      await db.collection("ai_runs").insertOne(runRecord);
    } catch {
      // non-fatal if logging fails
    }

    this.logger.log(`Consiglio AI Coach generato per atleta ${userId} (${latencyMs}ms)`);
    return {
      advice: response.data,
      meta: {
        provider: response.provider,
        model: response.model,
        latencyMs,
        promptVersion: COACH_PROMPT_VERSION,
      },
    };
  }
}
