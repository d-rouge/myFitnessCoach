import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { ReviewService } from "./review.service.js";

describe("ReviewService", () => {
  let service: ReviewService;
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
        id: "sess_1",
        dayIndex: 1,
        type: "run",
        title: "Corsa Facile",
        durationMin: 30,
        intensity: { rpe: 4 },
        status: "completed",
        contraindications: [],
      },
      {
        id: "sess_2",
        dayIndex: 3,
        type: "run",
        title: "Corsa Media",
        durationMin: 40,
        intensity: { rpe: 6 },
        status: "completed",
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
        if (name === "reviews") {
          return {
            updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
            find: () => ({
              sort: () => ({
                limit: () => ({
                  next: async () => null,
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

    service = new ReviewService(mockMongo);
  });

  it("computes a weekly review with high adherence", async () => {
    const review = await service.computeWeeklyReview("user_marco");
    expect(review.adherencePct).toBe(100);
    expect(review.plannedSessionsCount).toBe(2);
    expect(review.completedSessionsCount).toBe(2);
    expect(review.decision).toBe("progress");
  });
});
