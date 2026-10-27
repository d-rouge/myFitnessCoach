import { LlmProviderError } from "@health-trainer/ai";
import type { Env } from "@health-trainer/config";
import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import type { MongoService } from "../database/mongo.service.js";

const insertOne = vi.fn(async (_doc?: unknown) => ({ acknowledged: true }));

vi.mock("./llm.provider.js", () => ({
  llmSettings: () => ({ model: "deepseek-flash", thinking: false }),
  createLlmProvider: () => ({
    id: "deepseek",
    generate: async () => {
      throw new LlmProviderError("deepseek", "Rate limit DeepSeek", {
        status: 429,
        retryable: true,
      });
    },
  }),
}));

const { AiService } = await import("./ai.service.js");

const mockMicroPlan = {
  id: "micro_1",
  userId: "user_marco",
  macroPlanId: "macro_1",
  weekIndex: 1,
  weekStartDate: "2026-10-26",
  focus: "Test week",
  deload: false,
  sessions: [
    {
      id: "sess_run_1",
      dayIndex: 1,
      type: "run",
      sport: "running",
      title: "Corsa Facile 30'",
      durationMin: 30,
      intensity: { rpe: 4 },
      status: "scheduled",
      contraindications: [],
    },
  ],
};

function serviceWithDb(): InstanceType<typeof AiService> {
  const mockDb = {
    collection: (name: string) => {
      if (name === "athlete_micro_plans") {
        return {
          find: () => ({
            sort: () => ({
              limit: () => ({
                next: async () => mockMicroPlan,
                toArray: async () => [mockMicroPlan],
              }),
            }),
          }),
          findOne: async () => mockMicroPlan,
        };
      }
      if (name === "athlete_baselines") {
        return {
          findOne: async () => ({
            profile: { name: "Marco", timezone: "Europe/Rome" },
            preferences: { tone: "supportive" },
          }),
        };
      }
      if (name === "checkins") {
        return {
          find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }),
        };
      }
      return { insertOne };
    },
  } as unknown as Db;

  const mongo = { getDb: async () => mockDb } as unknown as MongoService;
  return new AiService({ NODE_ENV: "test" } as unknown as Env, mongo);
}

describe("AiService con provider LLM", () => {
  it("propaga un errore ritentabile come servizio non disponibile e lo registra", async () => {
    const service = serviceWithDb();

    await expect(service.getCoachAdvice("user_marco", "sess_run_1")).rejects.toThrow(
      /Coach LLM non disponibile/,
    );

    expect(insertOne).toHaveBeenCalledTimes(1);
    const record = insertOne.mock.calls[0]?.[0] as unknown as {
      success: boolean;
      errorMessage: string;
      provider: string;
      model: string;
    };
    expect(record.success).toBe(false);
    expect(record.errorMessage).toContain("Rate limit");
    expect(record.provider).toBe("deepseek");
    expect(record.model).toBe("deepseek-flash");
  });
});
