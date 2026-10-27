import { LlmProviderError } from "@health-trainer/ai";
import type { Env } from "@health-trainer/config";
import { beginnerPersona } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteService } from "../athlete/athlete.service.js";
import type { MongoService } from "../database/mongo.service.js";

const generateMock = vi.hoisted(() => vi.fn());
const insertOne = vi.hoisted(() => vi.fn(async (_doc?: unknown) => ({ acknowledged: true })));

vi.mock("./llm.provider.js", () => ({
  llmSettings: (_env: unknown, _purpose: unknown, hints?: { hardContext?: boolean }) => ({
    model: "deepseek-flash",
    thinking: Boolean(hints?.hardContext),
  }),
  createLlmProvider: () => ({ id: "deepseek", generate: generateMock }),
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
      date: "2026-10-26",
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

const marathon = {
  userId: "user_marco",
  source: "garmin",
  sport: "running",
  start: "2026-10-25T07:00:00Z",
  localDate: "2026-10-25",
  durationSec: 17_490,
  distanceM: 42_641,
};

const validAdvice = {
  headline: "Recupero post-maratona",
  readinessSummary: "Finestra di recupero attiva.",
  workoutFocus: "Resta facile.",
  tips: ["Non aggiungere volume."],
  encouragement: "Costanza.",
};

function chain<T>(docs: T[], one: T | null) {
  return {
    find: () => ({
      sort: () => ({
        toArray: async () => docs,
        limit: () => ({ toArray: async () => docs, next: async () => one }),
      }),
    }),
    findOne: async () => one,
  };
}

const baselineDoc = beginnerPersona;

function serviceWithDb(): InstanceType<typeof AiService> {
  const mockDb = {
    collection: (name: string) => {
      if (name === "athlete_micro_plans") return chain([mockMicroPlan], mockMicroPlan);
      if (name === "athlete_macro_plans") return chain([], null);
      if (name === "athlete_baselines") return chain([], baselineDoc);
      if (name === "activities") return chain([marathon], marathon);
      if (name === "checkins") return chain([], null);
      return { insertOne };
    },
  } as unknown as Db;

  const mongo = { getDb: async () => mockDb } as unknown as MongoService;
  return new AiService({ NODE_ENV: "test" } as unknown as Env, mongo, new AthleteService(mongo));
}

describe("AiService con provider LLM", () => {
  beforeEach(() => {
    generateMock.mockReset();
    insertOne.mockClear();
  });

  it("passa al modello il contesto recente come dato strutturato", async () => {
    generateMock.mockResolvedValue({
      data: validAdvice,
      provider: "deepseek",
      model: "deepseek-flash",
      usage: { inputTokens: 400, outputTokens: 120 },
      latencyMs: 1200,
    });

    const service = serviceWithDb();
    const result = await service.getCoachAdvice("user_marco", "sess_run_1");

    expect(result.advice.headline).toBe("Recupero post-maratona");

    const request = generateMock.mock.calls[0]?.[0] as {
      user: string;
      thinking: boolean;
      system: string;
    };
    const payload = JSON.parse(request.user) as {
      dossier: {
        recentContext: {
          lastLongEffort: { label: string; daysAgo: number } | null;
          postRaceRecovery: { active: boolean };
        };
      } | null;
    };

    expect(payload.dossier?.recentContext.postRaceRecovery.active).toBe(true);
    expect(payload.dossier?.recentContext.lastLongEffort?.label).toMatch(/maratona/i);
    // La finestra di recupero attiva accende il thinking anche sul coach.
    expect(request.thinking).toBe(true);
    expect(request.system).toMatch(/postRaceRecovery/);
  });

  it("propaga un errore ritentabile come servizio non disponibile e lo registra", async () => {
    generateMock.mockRejectedValue(
      new LlmProviderError("deepseek", "Rate limit DeepSeek", { status: 429, retryable: true }),
    );

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
