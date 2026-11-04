import { randomUUID } from "node:crypto";
import {
  type LlmProvider,
  LlmProviderError,
  METHODOLOGY_PROMPT_VERSION,
  METHODOLOGY_RESPONSE_EXAMPLE,
  METHODOLOGY_SYSTEM_PROMPT,
  METHODOLOGY_USER_INSTRUCTION,
} from "@health-trainer/ai";
import type { Env } from "@health-trainer/config";
import { COLLECTIONS } from "@health-trainer/db";
import {
  buildMethodologyEnvelope,
  type MethodologyDecision,
  MethodologyDecisionSchema,
  type MethodologyEnvelope,
  type MethodologyValidation,
  validateMethodology,
} from "@health-trainer/domain";
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { recordAiRun } from "../ai/ai-runs.js";
import { createLlmProvider, llmSettings } from "../ai/llm.provider.js";
import { AthleteService } from "../athlete/athlete.service.js";
import { APP_ENV } from "../config/env.module.js";
import { MongoService } from "../database/mongo.service.js";

export interface MethodologyEvaluation {
  id: string;
  userId: string;
  createdAt: string;
  promptVersion: string;
  /** Obiettivo per cui è stata scelta: evita di riusarla dopo un cambio goal. */
  goalDescription: string;
  provider: string;
  model: string;
  envelope: MethodologyEnvelope;
  decision: MethodologyDecision;
  validation: MethodologyValidation;
}

/**
 * Chiede all'LLM quale metodologia è più efficace per l'atleta, con i dati
 * attuali. Non genera sedute e non decide volumi: quelli vengono verificati
 * contro l'envelope e, in un passaggio successivo, passati al generatore.
 */
@Injectable()
export class MethodologyService {
  private readonly logger = new Logger(MethodologyService.name);
  private readonly provider: LlmProvider;
  private readonly settings: ReturnType<typeof llmSettings>;

  constructor(
    @Inject(APP_ENV) env: Env,
    private readonly mongo: MongoService,
    private readonly athlete: AthleteService,
  ) {
    this.provider = createLlmProvider(env, "planning");
    this.settings = llmSettings(env, "planning");
  }

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async ask(
    userId: string,
    user: string,
  ): Promise<{
    decision: MethodologyDecision;
    provider: string;
    model: string;
  }> {
    const run = {
      userId,
      task: "methodology",
      promptVersion: METHODOLOGY_PROMPT_VERSION,
      provider: this.provider.id,
      model: this.settings.model,
    };
    try {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const startedAt = Date.now();
        try {
          const response = await this.provider.generate({
            task: "macro",
            system: [
              METHODOLOGY_SYSTEM_PROMPT,
              METHODOLOGY_USER_INSTRUCTION,
              `Esempio di risposta JSON: ${METHODOLOGY_RESPONSE_EXAMPLE}`,
            ].join("\n\n"),
            user,
            schema: MethodologyDecisionSchema,
            model: this.settings.model,
            thinking: this.settings.thinking,
            temperature: 0.3,
            // Il thinking consuma parte del budget di output: con 2k il JSON
            // arrivava troncato. 12k lascia spazio a ragionamento,
            // periodizzazione e fasi.
            maxTokens: 12000,
          });
          await recordAiRun(this.mongo, run, startedAt, { response });
          return {
            decision: response.data,
            provider: response.provider,
            model: response.model,
          };
        } catch (error) {
          await recordAiRun(this.mongo, run, startedAt, { error });
          // Un JSON troncato/malformato è transitorio: un secondo tentativo
          // costa meno di un 503 all'utente.
          if (error instanceof LlmProviderError && error.retryable && attempt === 1) {
            this.logger.warn(`Metodologo: risposta non valida, nuovo tentativo (${error.message})`);
            continue;
          }
          throw error;
        }
      }
      throw new ServiceUnavailableException("Metodologo LLM non disponibile.");
    } catch (error) {
      if (error instanceof LlmProviderError) {
        throw new ServiceUnavailableException(`Metodologo LLM non disponibile: ${error.message}`);
      }
      throw error;
    }
  }

  async evaluate(
    userId: string,
    interviewFindings: Record<string, unknown> = {},
  ): Promise<MethodologyEvaluation> {
    const context = await this.athlete.getContext(userId);
    if (!context) {
      throw new NotFoundException("Nessuna baseline attiva trovata.");
    }
    if (this.provider.id === "managed") {
      throw new ServiceUnavailableException(
        "La scelta della metodologia richiede un modello LLM configurato.",
      );
    }

    const { baseline, dossier } = context;
    const envelope = buildMethodologyEnvelope(baseline, dossier.recentContext);
    const basePayload = {
      question: METHODOLOGY_USER_INSTRUCTION,
      envelope,
      context: dossier,
      interviewFindings,
    };

    let result = await this.ask(userId, JSON.stringify(basePayload));
    let validation = validateMethodology(result.decision, envelope);

    // Una sola correzione: se il modello esce dall'envelope, gli si mostra
    // esattamente cosa ha sbagliato. Non si accetta una proposta fuori limite.
    if (!validation.valid) {
      this.logger.warn(
        `Metodologia fuori envelope per utente ${userId}: ${validation.issues.join("; ")}`,
      );
      result = await this.ask(
        userId,
        JSON.stringify({
          ...basePayload,
          previousDecision: result.decision,
          validationIssues: validation.issues,
          instruction:
            "La proposta precedente non rispetta l'envelope. Correggi solo i punti elencati e restituisci un nuovo JSON valido.",
        }),
      );
      validation = validateMethodology(result.decision, envelope);
    }

    if (!validation.valid) {
      throw new UnprocessableEntityException({
        message: "La metodologia proposta non rispetta i limiti dell'atleta.",
        issues: validation.issues,
        envelope,
      });
    }

    const record: MethodologyEvaluation = {
      id: `methodology_${randomUUID()}`,
      userId,
      createdAt: new Date().toISOString(),
      promptVersion: METHODOLOGY_PROMPT_VERSION,
      goalDescription: baseline.goals.primary.description,
      provider: result.provider,
      model: result.model,
      envelope,
      decision: result.decision,
      validation,
    };

    const db = await this.db();
    await db.collection(COLLECTIONS.methodologyDecisions).insertOne(record);
    this.logger.log(
      `Metodologia valutata per utente ${userId}: ${record.decision.methodology} (${record.decision.confidence})`,
    );
    return record;
  }

  async latest(userId: string): Promise<MethodologyEvaluation | null> {
    const db = await this.db();
    const doc = await db
      .collection<MethodologyEvaluation>(COLLECTIONS.methodologyDecisions)
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();
    if (!doc) return null;
    const { _id: _ignored, ...record } = doc as MethodologyEvaluation & { _id?: unknown };
    return record;
  }

  /**
   * Rivalutazione periodica: se la decisione è più vecchia di `maxAgeDays` la
   * rifà con i dati attuali. È il punto che la review settimanale richiama.
   */
  async reevaluateIfStale(
    userId: string,
    maxAgeDays: number,
  ): Promise<{ evaluation: MethodologyEvaluation | null; refreshed: boolean }> {
    const latest = await this.latest(userId);
    if (latest) {
      const ageDays = (Date.now() - Date.parse(latest.createdAt)) / 86_400_000;
      if (Number.isFinite(ageDays) && ageDays < maxAgeDays) {
        return { evaluation: latest, refreshed: false };
      }
    }
    const evaluation = await this.evaluate(userId);
    return { evaluation, refreshed: true };
  }
}
