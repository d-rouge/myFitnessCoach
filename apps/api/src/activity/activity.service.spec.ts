import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { ActivityService } from "./activity.service.js";

describe("ActivityService", () => {
  let service: ActivityService;
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
            updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
          };
        }
        if (name === "activities") {
          return {
            bulkWrite: vi.fn().mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 }),
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
          findOne: async () => null,
          updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
        };
      }) as unknown as Db["collection"],
    };

    mockMongo = {
      getDb: vi.fn().mockResolvedValue(mockDb as Db),
    } as unknown as MongoService;

    service = new ActivityService(mockMongo);
  });

  it("records a manual activity and compares it with planned session", async () => {
    const res = await service.recordManualActivity("user_marco", {
      sessionId: "sess_run_1",
      durationMin: 32,
      distanceKm: 5.2,
      avgHr: 142,
      maxHr: 158,
      rpe: 5,
      notes: "Ottime sensazioni",
    });

    expect(res.activity).toBeDefined();
    expect(res.activity.source).toBe("manual");
    expect(res.activity.durationSec).toBe(32 * 60);
    expect(res.comparison).toBeDefined();
    expect(res.comparison?.sessionId).toBe("sess_run_1");
    expect(res.comparison?.adherenceScore).toBeGreaterThanOrEqual(90);
  });
});
