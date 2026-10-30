import type { z } from "zod";

export type LlmTask = "intake" | "macro" | "micro" | "daily" | "review" | "safety" | "chat";

export type LlmProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "deepseek"
  | "ollama"
  | "managed";

export interface LlmRequest<TSchema extends z.ZodType> {
  task: LlmTask;
  system: string;
  user: string;
  schema: TSchema;
  /** Override del modello per la singola richiesta (es. pro per pianificare). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Chain-of-thought prima della risposta. Costa più token ed è più lento, ma
   * migliora i task di pianificazione e di critica.
   */
  thinking?: boolean;
  reasoningEffort?: "low" | "high" | "max";
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface LlmResponse<T> {
  data: T;
  provider: LlmProviderId;
  model: string;
  usage: LlmUsage;
  latencyMs: number;
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  generate<TSchema extends z.ZodType>(
    request: LlmRequest<TSchema>,
  ): Promise<LlmResponse<z.infer<TSchema>>>;
}

export {
  COACH_CONTEXT_RULES,
  COACH_PROMPT_VERSION,
  COACH_RESPONSE_EXAMPLE,
  COACH_SYSTEM_PROMPT,
  COACH_USER_INSTRUCTION,
  type CoachAdvice,
  type CoachAdviceInput,
  CoachAdviceSchema,
  DeterministicCoachProvider,
  generateDeterministicCoachAdvice,
} from "./coach.js";
export { LlmProviderError } from "./errors.js";
export {
  INTERVIEW_PROMPT_VERSION,
  INTERVIEW_RESPONSE_EXAMPLE,
  INTERVIEW_SYSTEM_PROMPT,
  INTERVIEW_USER_INSTRUCTION,
} from "./interview.js";
export {
  METHODOLOGY_PROMPT_VERSION,
  METHODOLOGY_RESPONSE_EXAMPLE,
  METHODOLOGY_SYSTEM_PROMPT,
  METHODOLOGY_USER_INSTRUCTION,
} from "./methodology.js";
export {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODELS,
  type DeepSeekModel,
  DeepSeekProvider,
  type DeepSeekProviderOptions,
  isDeepSeekModel,
} from "./providers/deepseek.js";

export {
  type AiRunRecord,
  AiRunRecordSchema,
  createAiRunRecord,
} from "./runs.js";
