import type { z } from "zod";

export type LlmTask = "intake" | "macro" | "micro" | "daily" | "review" | "safety" | "chat";

export type LlmProviderId = "openai" | "anthropic" | "google" | "openrouter" | "ollama" | "managed";

export interface LlmRequest<TSchema extends z.ZodType> {
  task: LlmTask;
  system: string;
  user: string;
  schema: TSchema;
  temperature?: number;
  maxTokens?: number;
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
