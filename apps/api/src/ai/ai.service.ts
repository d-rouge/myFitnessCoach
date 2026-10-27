import {
  COACH_CONTEXT_RULES,
  COACH_PROMPT_VERSION,
  COACH_RESPONSE_EXAMPLE,
  COACH_SYSTEM_PROMPT,
  COACH_USER_INSTRUCTION,
  type CoachAdvice,
  CoachAdviceSchema,
  createAiRunRecord,
  type LlmProvider,
  LlmProviderError,
  type LlmResponse,
} from "@health-trainer/ai";
import type { Env } from "@health-trainer/config";
import {
  COLLECTIONS,
  getCurrentBaseline,
  getCurrentMicroPlan,
  getRecentCheckins,
} from "@health-trainer/db";
import { type PlannedSession, resolveTimeZone, todayLocalDate } from "@health-trainer/domain";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AthleteService } from "../athlete/athlete.service.js";
import { APP_ENV } from "../config/env.module.js";
import { MongoService } from "../database/mongo.service.js";
import { createLlmProvider, llmSettings } from "./llm.provider.js";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: LlmProvider;
  private readonly settings: ReturnType<typeof llmSettings>;

  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly mongo: MongoService,
    private readonly athlete: AthleteService,
  ) {
    this.provider = createLlmProvider(env, "coach");
    // Modello statico; il thinking dipende dal contesto e viene risolto per
    // richiesta in `resolveSettings`.
    this.settings = llmSettings(env, "coach");
  }

  private resolveSettings(hardContext: boolean): ReturnType<typeof llmSettings> {
    return llmSettings(this.env, "coach", { hardContext });
  }

  /**
   * Registra anche le chiamate fallite: senza questo, un modello che risponde
   * 429 sistematicamente sarebbe invisibile nella collezione `ai_runs`.
   * Il messaggio d'errore non contiene mai la chiave API.
   */
  private async recordFailure(userId: string, error: unknown, startedAt: number): Promise<void> {
    try {
      const db = await this.db();
      await db.collection(COLLECTIONS.aiRuns).insertOne(
        createAiRunRecord({
          userId,
          task: "daily_coach",
          promptVersion: COACH_PROMPT_VERSION,
          provider: this.provider.id,
          model: this.settings.model,
          latencyMs: Date.now() - startedAt,
          success: false,
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "errore sconosciuto",
        }),
      );
    } catch {
      // il logging non deve mascherare l'errore originale
    }
  }

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
    const timezone = resolveTimeZone(baseline?.profile.timezone);
    const recentCheckins = await getRecentCheckins(db, userId, 2);
    const todayStr = todayLocalDate(timezone);
    const todayCheckin = recentCheckins.find((c) => c.date === todayStr);

    // Contesto compilato una volta sola e condiviso con la generazione del
    // piano: niente secondo percorso che può divergere.
    const context = await this.athlete.getContext(userId);
    const dossier = context?.dossier ?? null;

    const athleteName = baseline?.userId ? `Atleta` : "Atleta";
    const tone = baseline?.profile?.tone || "supportive";
    const injuryAlerts =
      baseline?.anamnesis?.injuries
        ?.filter((i) => i.status === "acute" || i.status === "recovering" || i.status === "chronic")
        .map((i) => `${i.area} (dolore ${i.painLevel}/10)`) ?? [];

    const readinessBand =
      todayCheckin && (todayCheckin.energy ?? 3) <= 2
        ? ("impaired" as const)
        : ("optimal" as const);
    const painReported = (todayCheckin?.pain?.length ?? 0) > 0;

    const promptPayload = {
      athleteName,
      tone,
      session,
      checkin: todayCheckin ?? null,
      readinessBand,
      injuryAlerts,
      dossier: dossier
        ? {
            identity: dossier.identity,
            goals: dossier.goals,
            capacity: dossier.capacity,
            recentContext: dossier.recentContext,
            individualResponse: dossier.individualResponse,
            planMemory: dossier.planMemory,
            constraints: {
              conditions: dossier.constraints.conditions,
              medications: dossier.constraints.medications,
              injuries: dossier.constraints.injuries,
              redFlags: dossier.constraints.redFlags,
              parqCleared: dossier.constraints.parqCleared,
            },
            preferences: dossier.preferences,
            warnings: dossier.warnings,
          }
        : null,
    };

    // Il thinking costa latenza: si accende solo quando c'è qualcosa da
    // giudicare, non per una seduta facile senza segnali.
    const settings = this.resolveSettings(
      painReported ||
        injuryAlerts.length > 0 ||
        readinessBand === "impaired" ||
        (dossier?.recentContext.postRaceRecovery.active ?? false) ||
        (dossier?.recentContext.flags.includes("load_spike") ?? false) ||
        (dossier?.individualResponse.recurringPainAreas.length ?? 0) > 0,
    );

    // Istruzioni e formato nel system prompt; nel user solo il payload JSON.
    // Così il provider deterministico continua a leggere il payload e il
    // percorso LLM ha comunque la parola "json" e l'esempio richiesti dalla
    // JSON mode.
    const system = [
      COACH_SYSTEM_PROMPT,
      COACH_CONTEXT_RULES,
      COACH_USER_INSTRUCTION,
      `Esempio di risposta JSON: ${COACH_RESPONSE_EXAMPLE}`,
    ].join("\n\n");
    const user = JSON.stringify(promptPayload);

    let response: LlmResponse<CoachAdvice>;
    try {
      response = await this.provider.generate({
        task: "daily",
        system,
        user,
        schema: CoachAdviceSchema,
        model: settings.model,
        thinking: settings.thinking,
        temperature: 0.5,
        maxTokens: 1200,
      });
    } catch (error) {
      await this.recordFailure(userId, error, startTime);
      if (error instanceof LlmProviderError) {
        throw new ServiceUnavailableException(`Coach LLM non disponibile: ${error.message}`);
      }
      throw error;
    }

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
      await db.collection(COLLECTIONS.aiRuns).insertOne(runRecord);
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
