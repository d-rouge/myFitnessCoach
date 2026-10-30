import { randomUUID } from "node:crypto";
import {
  INTERVIEW_PROMPT_VERSION,
  INTERVIEW_RESPONSE_EXAMPLE,
  INTERVIEW_SYSTEM_PROMPT,
  INTERVIEW_USER_INSTRUCTION,
  type LlmProvider,
  LlmProviderError,
} from "@health-trainer/ai";
import type { Env } from "@health-trainer/config";
import { COLLECTIONS } from "@health-trainer/db";
import {
  type AthleteDossier,
  type InterviewFindings,
  type InterviewQuestion,
  InterviewTurnSchema,
  todayLocalDate,
} from "@health-trainer/domain";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createLlmProvider, llmSettings } from "../ai/llm.provider.js";
import { AthleteService } from "../athlete/athlete.service.js";
import { BaselineService } from "../baseline/baseline.service.js";
import { APP_ENV } from "../config/env.module.js";
import { MongoService } from "../database/mongo.service.js";
import { MethodologyService } from "./methodology.service.js";
import { PlanService } from "./plan.service.js";

export type InterviewStatus = "active" | "ready" | "generated";

export interface InterviewMessage {
  role: "assistant" | "user";
  content: string;
  createdAt: string;
}

export interface PlanInterviewRecord {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  promptVersion: string;
  status: InterviewStatus;
  messages: InterviewMessage[];
  findings: InterviewFindings;
  questions: InterviewQuestion[];
  methodologyId?: string;
  planId?: string;
}

const MAX_USER_TURNS = 6;

/**
 * Intervista di pianificazione. L'LLM conduce il dialogo e raccoglie i dati
 * mancanti; quando è pronto, la metodologia viene rivalutata con i findings e
 * il piano viene generato con quella scelta. Il modello non scrive sedute.
 */
@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);
  private readonly provider: LlmProvider;
  private readonly settings: ReturnType<typeof llmSettings>;

  constructor(
    @Inject(APP_ENV) env: Env,
    private readonly mongo: MongoService,
    private readonly athlete: AthleteService,
    private readonly baselines: BaselineService,
    private readonly methodology: MethodologyService,
    private readonly plan: PlanService,
  ) {
    this.provider = createLlmProvider(env, "coach");
    this.settings = llmSettings(env, "coach");
  }

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async context(userId: string): Promise<AthleteDossier> {
    const context = await this.athlete.getContext(userId);
    if (!context) {
      throw new NotFoundException("Nessuna baseline attiva trovata.");
    }
    return context.dossier;
  }

  private async ask(
    dossier: AthleteDossier,
    record: PlanInterviewRecord,
    lastUserMessage: string | null,
  ) {
    if (this.provider.id === "managed") {
      throw new ServiceUnavailableException("L'intervista richiede un modello LLM configurato.");
    }

    const userTurns = record.messages.filter((message) => message.role === "user").length;
    const payload = {
      question: INTERVIEW_USER_INSTRUCTION,
      context: dossier,
      findings: record.findings,
      conversation: record.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      lastUserMessage,
      userTurns,
      maxUserTurns: MAX_USER_TURNS,
    };

    try {
      const response = await this.provider.generate({
        task: "chat",
        system: [
          INTERVIEW_SYSTEM_PROMPT,
          INTERVIEW_USER_INSTRUCTION,
          `Esempio di risposta JSON: ${INTERVIEW_RESPONSE_EXAMPLE}`,
        ].join("\n\n"),
        user: JSON.stringify(payload),
        schema: InterviewTurnSchema,
        model: this.settings.model,
        temperature: 0.5,
        maxTokens: 1600,
      });
      return response.data;
    } catch (error) {
      if (error instanceof LlmProviderError) {
        throw new ServiceUnavailableException(`Intervista LLM non disponibile: ${error.message}`);
      }
      throw error;
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  async start(userId: string): Promise<PlanInterviewRecord> {
    const existing = await this.latest(userId);
    if (existing && existing.status !== "generated") {
      return existing;
    }

    const dossier = await this.context(userId);
    const createdAt = this.now();
    const record: PlanInterviewRecord = {
      id: `interview_${randomUUID()}`,
      userId,
      createdAt,
      updatedAt: createdAt,
      promptVersion: INTERVIEW_PROMPT_VERSION,
      status: "active",
      messages: [],
      findings: {},
      questions: [],
    };

    const turn = await this.ask(dossier, record, null);
    record.messages.push({ role: "assistant", content: turn.reply, createdAt: this.now() });
    record.findings = turn.findings;
    record.questions = turn.questions;
    record.status = turn.readyToPlan ? "ready" : "active";

    const db = await this.db();
    await db.collection(COLLECTIONS.planInterviews).insertOne(record);
    this.logger.log(`Intervista avviata per utente ${userId} (${record.id})`);
    return record;
  }

  async latest(userId: string): Promise<PlanInterviewRecord | null> {
    const db = await this.db();
    const doc = await db
      .collection<PlanInterviewRecord>(COLLECTIONS.planInterviews)
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();
    if (!doc) return null;
    const { _id: _ignored, ...record } = doc as PlanInterviewRecord & { _id?: unknown };
    return record;
  }

  async get(userId: string, interviewId: string): Promise<PlanInterviewRecord> {
    const db = await this.db();
    const doc = await db
      .collection<PlanInterviewRecord>(COLLECTIONS.planInterviews)
      .findOne({ userId, id: interviewId });
    if (!doc) {
      throw new NotFoundException("Intervista non trovata.");
    }
    const { _id: _ignored, ...record } = doc as PlanInterviewRecord & { _id?: unknown };
    return record;
  }

  async message(
    userId: string,
    interviewId: string,
    message: string,
  ): Promise<PlanInterviewRecord> {
    const record = await this.get(userId, interviewId);
    if (record.status === "generated") {
      throw new BadRequestException("Questa intervista ha già generato un piano.");
    }

    const dossier = await this.context(userId);
    record.messages.push({ role: "user", content: message, createdAt: this.now() });
    const turn = await this.ask(dossier, record, message);

    record.findings = { ...record.findings, ...turn.findings };
    record.messages.push({ role: "assistant", content: turn.reply, createdAt: this.now() });
    record.questions = turn.questions;
    record.updatedAt = this.now();

    const userTurns = record.messages.filter((entry) => entry.role === "user").length;
    record.status = turn.readyToPlan || userTurns >= MAX_USER_TURNS ? "ready" : "active";

    const db = await this.db();
    await db.collection(COLLECTIONS.planInterviews).updateOne(
      { userId, id: interviewId },
      {
        $set: {
          messages: record.messages,
          findings: record.findings,
          questions: record.questions,
          status: record.status,
          updatedAt: record.updatedAt,
        },
      },
    );
    return record;
  }

  async generate(
    userId: string,
    interviewId: string,
  ): Promise<{
    interview: PlanInterviewRecord;
    methodologyId: string;
    baseline: Awaited<ReturnType<BaselineService["save"]>>;
    plan: Awaited<ReturnType<PlanService["generateMacroPlan"]>>;
  }> {
    const record = await this.get(userId, interviewId);
    if (record.status !== "ready") {
      throw new BadRequestException(
        "L'intervista non è ancora pronta: rispondi alle domande mancanti.",
      );
    }

    const context = await this.athlete.getContext(userId);
    if (!context) {
      throw new NotFoundException("Nessuna baseline attiva trovata.");
    }

    // La data concordata in chat aggiorna la baseline: il piano e la scheda
    // obiettivo devono leggere lo stesso orizzonte.
    let baseline = context.baseline;
    const agreedCandidate = extractTargetDate(record.findings);
    const today = todayLocalDate(baseline.profile.timezone);
    const agreedTargetDate = agreedCandidate && agreedCandidate > today ? agreedCandidate : null;
    if (agreedCandidate && !agreedTargetDate) {
      this.logger.warn(
        `Data target ignorata in intervista ${interviewId}: ${agreedCandidate} non è nel futuro.`,
      );
    }
    if (agreedTargetDate && agreedTargetDate !== baseline.goals.primary.targetDate) {
      baseline = await this.baselines.save(userId, {
        ...baseline,
        goals: {
          ...baseline.goals,
          primary: { ...baseline.goals.primary, targetDate: agreedTargetDate },
        },
      });
      this.logger.log(`Data target aggiornata da intervista ${interviewId}: ${agreedTargetDate}`);
    }

    const evaluation = await this.methodology.evaluate(userId, record.findings);
    const plan = await this.plan.generateMacroPlan(userId, {});

    record.status = "generated";
    record.methodologyId = evaluation.id;
    record.planId = plan.macroPlan.id;
    record.updatedAt = this.now();

    const db = await this.db();
    await db.collection(COLLECTIONS.planInterviews).updateOne(
      { userId, id: interviewId },
      {
        $set: {
          status: record.status,
          methodologyId: record.methodologyId,
          planId: record.planId,
          updatedAt: record.updatedAt,
        },
      },
    );

    this.logger.log(
      `Piano generato da intervista ${interviewId} per utente ${userId} (${plan.macroPlan.id})`,
    );
    return { interview: record, methodologyId: evaluation.id, baseline, plan };
  }
}

const TARGET_DATE_KEYS = ["targetDate", "target_date", "recommendedTargetDate", "data_target"];

/** Estrae una data target concordata dai findings, solo se è una data ISO valida. */
function extractTargetDate(findings: InterviewFindings): string | null {
  for (const key of TARGET_DATE_KEYS) {
    const value = findings[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
  }
  return null;
}
