import type { Env } from "@health-trainer/config";
import { beginnerPersona } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteService } from "../athlete/athlete.service.js";
import type { MongoService } from "../database/mongo.service.js";
import { AiService } from "./ai.service.js";

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

/**
 * MongoDB finto minimo: ogni collezione espone la catena
 * `find().sort()[.limit()]` usata dai repository.
 */
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

describe("AiService", () => {
  let service: AiService;

  beforeEach(() => {
    const collections = vi.fn().mockImplementation((name: string) => {
      if (name === "athlete_micro_plans") return chain([mockMicroPlan], mockMicroPlan);
      if (name === "athlete_macro_plans") return chain([], null);
      if (name === "athlete_baselines") return chain([], baselineDoc);
      if (name === "activities" || name === "checkins") return chain([], null);
      return { insertOne: vi.fn().mockResolvedValue({ acknowledged: true }) };
    });

    const mockDb = { collection: collections } as unknown as Db;
    const mockMongo = { getDb: async () => mockDb } as unknown as MongoService;
    const env = { NODE_ENV: "test" } as unknown as Env;

    service = new AiService(env, mockMongo, new AthleteService(mockMongo));
  });

  it("generates structured coach advice for athlete's session", async () => {
    const res = await service.getCoachAdvice("user_marco", "sess_run_1");

    expect(res.advice).toBeDefined();
    expect(res.advice.headline).toContain("Corsa Facile 30'");
    expect(res.advice.tips.length).toBeGreaterThan(0);
    expect(res.meta.provider).toBe("managed");
  });
});
