import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { AiService } from "./ai.service.js";

describe("AiService", () => {
  let service: AiService;
  let mockMongo: MongoService;
  let mockDb: Partial<Db>;

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

  beforeEach(() => {
    mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
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
              profile: { name: "Marco" },
              preferences: { tone: "supportive" },
            }),
          };
        }
        if (name === "checkins") {
          return {
            find: () => ({
              sort: () => ({
                limit: () => ({
                  toArray: async () => [],
                }),
              }),
            }),
          };
        }
        return {
          insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
        };
      }) as unknown as Db["collection"],
    };

    mockMongo = {
      getDb: vi.fn().mockResolvedValue(mockDb as Db),
    } as unknown as MongoService;

    service = new AiService(mockMongo);
  });

  it("generates structured coach advice for athlete's session", async () => {
    const res = await service.getCoachAdvice("user_marco", "sess_run_1");
    expect(res.advice).toBeDefined();
    expect(res.advice.headline).toContain("Corsa Facile 30'");
    expect(res.advice.tips.length).toBeGreaterThan(0);
    expect(res.meta.provider).toBe("managed");
  });
});
