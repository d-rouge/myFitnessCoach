import { createAiRunRecord, type LlmResponse } from "@health-trainer/ai";
import { COLLECTIONS } from "@health-trainer/db";
import type { MongoService } from "../database/mongo.service.js";

export interface AiRunContext {
  userId: string;
  task: string;
  promptVersion: string;
  provider: string;
  model: string;
}

export type AiRunOutcome = { response: LlmResponse<unknown> } | { error: unknown };

/**
 * Records one LLM call in `ai_runs`, failed attempts included: a model that
 * keeps answering 429 must stay visible. Logging never masks the call's own
 * outcome, and the error message never contains the API key.
 */
export async function recordAiRun(
  mongo: MongoService,
  context: AiRunContext,
  startedAt: number,
  outcome: AiRunOutcome,
): Promise<void> {
  const record =
    "response" in outcome
      ? createAiRunRecord({
          ...context,
          provider: outcome.response.provider,
          model: outcome.response.model,
          latencyMs: Date.now() - startedAt,
          inputTokens: outcome.response.usage.inputTokens,
          outputTokens: outcome.response.usage.outputTokens,
          costUsd: outcome.response.usage.costUsd,
        })
      : createAiRunRecord({
          ...context,
          latencyMs: Date.now() - startedAt,
          success: false,
          errorMessage:
            outcome.error instanceof Error
              ? outcome.error.message.slice(0, 500)
              : "errore sconosciuto",
        });

  try {
    const db = await mongo.getDb();
    await db.collection(COLLECTIONS.aiRuns).insertOne(record);
  } catch {
    // non-fatal: the call already succeeded or failed on its own
  }
}
