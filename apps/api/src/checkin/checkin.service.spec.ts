import { describe, expect, it } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import type { PlanService } from "../plan/plan.service.js";
import { CheckinService } from "./checkin.service.js";

describe("CheckinService", () => {
  const mockPlanService = {
    getTodaySession: async () => ({
      today: "2026-10-27",
      session: {
        id: "session_test",
        title: "Corsa Media Z2",
        durationMin: 50,
        sport: "running",
        type: "aerobic_base",
        intensity: { mode: "rpe", rpe: 7 },
        blocks: [],
        equipment: [],
        location: "outdoor",
        alternatives: [],
        contraindications: [],
        status: "planned",
      },
      alternatives: [],
      isRestDay: false,
    }),
    updateSession: async () => ({ success: true }),
  } as unknown as PlanService;

  it("saves a valid morning check-in and calculates adaptation", async () => {
    const memoryCheckins: Record<string, unknown>[] = [];
    const mockMongo = {
      getDb: async () => ({
        collection: () => ({
          updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
            memoryCheckins.push(update.$set);
            return { modifiedCount: 1, upsertedCount: 1 };
          },
        }),
      }),
    } as unknown as MongoService;

    const service = new CheckinService(mockMongo, mockPlanService);
    const result = await service.saveCheckin("user_marco", {
      date: "2026-10-27",
      type: "morning",
      energy: 4,
      sleepQuality: 4,
      soreness: 1,
      availableTimeMin: 60,
    });

    expect(result.checkin.type).toBe("morning");
    expect(result.adjustment).toBeDefined();
    expect(result.adjustment?.decision).toBe("confirm");
    expect(memoryCheckins).toHaveLength(1);
  });

  it("adapts session when available time is restricted", async () => {
    const mockMongo = {
      getDb: async () => ({
        collection: () => ({
          updateOne: async () => ({ modifiedCount: 1, upsertedCount: 1 }),
        }),
      }),
    } as unknown as MongoService;

    const service = new CheckinService(mockMongo, mockPlanService);
    const result = await service.saveCheckin("user_marco", {
      date: "2026-10-27",
      type: "morning",
      energy: 4,
      availableTimeMin: 25, // less than 50 min
    });

    expect(result.adjustment?.decision).toBe("swap");
    expect(result.adjustment?.adjustedSession?.durationMin).toBeLessThanOrEqual(25);
  });

  it("rejects invalid check-in data", async () => {
    const mockMongo = {} as unknown as MongoService;
    const service = new CheckinService(mockMongo, mockPlanService);

    await expect(service.saveCheckin("user_1", { invalid: "field" })).rejects.toThrow(
      /Check-in non valido/,
    );
  });
});
