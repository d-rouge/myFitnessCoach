import { z } from "zod";

export const AiRunRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  task: z.string(),
  promptVersion: z.string(),
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative(),
  contextHash: z.string().optional(),
  success: z.boolean(),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
});

export type AiRunRecord = z.infer<typeof AiRunRecordSchema>;

export function createAiRunRecord(params: {
  userId: string;
  task: string;
  promptVersion: string;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  contextHash?: string;
  success?: boolean;
  errorMessage?: string;
}): AiRunRecord {
  return {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: params.userId,
    task: params.task,
    promptVersion: params.promptVersion,
    provider: params.provider,
    model: params.model,
    latencyMs: params.latencyMs,
    inputTokens: params.inputTokens ?? 0,
    outputTokens: params.outputTokens ?? 0,
    costUsd: params.costUsd ?? 0,
    contextHash: params.contextHash,
    success: params.success ?? true,
    errorMessage: params.errorMessage,
    createdAt: new Date().toISOString(),
  };
}
