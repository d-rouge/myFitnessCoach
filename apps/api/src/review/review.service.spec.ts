import type { MicroPlan } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { applyReviewDecision, ReviewService } from "./review.service.js";

const mockMicroPlan: MicroPlan = {
  id: "micro_1",
  macroPlanId: "macro_1",
  weekIndex: 1,
  startDate: "2026-10-26",
  endDate: "2026-11-01",
  focus: "Test week",
  weeklyVolumeMin: 70,
  deload: false,
  sessions: [
    {
      id: "sess_1",
      date: "2026-10-26",
      sport: "running",
      type: "run",
      title: "Corsa Facile",
      durationMin: 30,
      intensity: { mode: "rpe", rpe: 4 },
      blocks: [],
      equipment: [],
      location: "outdoor",
      alternatives: [],
      contraindications: [],
      status: "completed",
    },
    {
      id: "sess_2",
      date: "2026-10-28",
      sport: "running",
      type: "run",
      title: "Corsa Media",
      durationMin: 40,
      intensity: { mode: "rpe", rpe: 6 },
      blocks: [],
      equipment: [],
      location: "outdoor",
      alternatives: [],
      contraindications: [],
      status: "completed",
    },
  ],
  rationale: "Rationale",
  flags: [],
};

describe("ReviewService", () => {
  let service: ReviewService;
  let mockMongo: MongoService;

  beforeEach(() => {
    const mockDb: Partial<Db> = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "athlete_micro_plans") {
          return {
            find: () => ({
              sort: () => ({
                limit: () => ({ next: async () => mockMicroPlan }),
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
                toArray: async () => [],
              }),
            }),
          };
        }
        if (name === "weekly_reviews") {
          return {
            updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
            find: () => ({
              sort: () => ({
                limit: () => ({ next: async () => null, toArray: async () => [] }),
              }),
            }),
            findOne: async () => null,
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

describe("applyReviewDecision", () => {
  const buildPlan = (): MicroPlan => ({
    ...mockMicroPlan,
    sessions: mockMicroPlan.sessions.map((session) => ({ ...session })),
  });

  it("adds 10% volume after a progress verdict", () => {
    const plan = buildPlan();

    applyReviewDecision(plan, "progress");

    expect(plan.deload).toBe(false);
    expect(plan.sessions[0]?.durationMin).toBe(33);
    expect(plan.sessions[1]?.durationMin).toBe(44);
    expect(plan.weeklyVolumeMin).toBe(77);
  });

  it("cuts 30% volume and lowers RPE after a deload verdict", () => {
    const plan = buildPlan();

    applyReviewDecision(plan, "deload");

    expect(plan.deload).toBe(true);
    expect(plan.sessions[0]?.durationMin).toBe(21);
    expect(plan.sessions[0]?.intensity.rpe).toBe(2);
    expect(plan.weeklyVolumeMin).toBe(49);
  });

  it("does not change volume after a continue verdict", () => {
    const plan = buildPlan();

    applyReviewDecision(plan, "continue");

    expect(plan.sessions[0]?.durationMin).toBe(30);
    expect(plan.weeklyVolumeMin).toBe(70);
  });
});
