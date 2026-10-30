import {
  type Activity,
  type Baseline,
  beginnerPersona,
  type MicroPlan,
} from "@health-trainer/domain";
import { describe, expect, it } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { BaselineService } from "./baseline.service.js";

const mockMongo = {
  getDb: async () => Promise.reject(new Error("No DB")),
} as unknown as MongoService;

describe("BaselineService", () => {
  const service = new BaselineService(mockMongo);

  it("evaluates safety of anamnesis", () => {
    const safe = service.evaluateSafety({
      conditions: [],
      medications: [],
      injuries: [],
      redFlags: [],
      parqCleared: true,
    });
    expect(safe.severity).toBe("ok");

    const flagged = service.evaluateSafety({
      conditions: ["uncontrolled hypertension"],
      medications: [],
      injuries: [],
      redFlags: [],
      parqCleared: false,
    });
    expect(flagged.severity).toBe("block");
  });

  it("derives 5k feasibility from activities, baseline and plans", () => {
    const baseline: Baseline = {
      ...beginnerPersona,
      profile: {
        ...beginnerPersona.profile,
        capacity: {
          ...beginnerPersona.profile.capacity,
          lastActivityDate: "2026-10-29",
          recent5kSec: 1642,
          source: "garmin",
        },
      },
    };
    const activities: Activity[] = [
      {
        userId: baseline.userId,
        source: "garmin",
        externalId: "run-1",
        sport: "running",
        start: "2026-10-03T07:00:00.000Z",
        localDate: "2026-10-03",
        durationSec: 5291,
        distanceM: 15080,
        fetchedAt: "2026-10-30T08:00:00.000Z",
      },
    ];

    const microPlans: MicroPlan[] = [
      {
        id: "micro-1",
        macroPlanId: "macro-1",
        weekIndex: 1,
        startDate: "2026-10-19",
        endDate: "2026-10-25",
        focus: "Test",
        weeklyVolumeMin: 120,
        deload: false,
        sessions: ["2026-10-20", "2026-10-22", "2026-10-24"].map((date, index) => ({
          id: `session-${index}`,
          date,
          sport: "running" as const,
          type: "easy",
          title: "Corsa facile",
          durationMin: 30,
          intensity: { mode: "rpe" as const, rpe: 4 },
          blocks: [],
          equipment: [],
          location: "outdoor" as const,
          alternatives: [],
          contraindications: [],
          status: "completed" as const,
        })),
        rationale: "Test",
        flags: [],
      },
    ];

    const result = service.estimate5kFeasibilityFromData({
      baseline,
      activities,
      microPlans,
      now: "2026-10-30T08:00:00.000Z",
    });

    // 82 giorni alla target date della persona → 12 settimane.
    expect(result.weeks).toBe(12);
    expect(result.weeklyVolumeKm).toBe(3.8);
    expect(result.input?.current5kSec).toBe(1642);
    expect(result.sessionsCompleted).toBe(3);
    expect(result.projection).not.toBeNull();
  });

  it("does not estimate 5k feasibility before the plan starts", () => {
    const baseline: Baseline = beginnerPersona;
    const result = service.estimate5kFeasibilityFromData({
      baseline,
      activities: [],
      microPlans: [],
      now: "2026-10-30T08:00:00.000Z",
    });

    expect(result.available).toBe(false);
    expect(result.projection).toBeNull();
    expect(result.planStartedOn).toBeNull();
    expect(result.sessionsCompleted).toBe(0);
    expect(result.warnings).toContain("plan_not_started");
  });

  it("rejects invalid baseline input on save", async () => {
    await expect(service.save("user-1", { invalid: "data" })).rejects.toThrow();
  });
});
