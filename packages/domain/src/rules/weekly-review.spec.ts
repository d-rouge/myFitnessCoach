import { describe, expect, it } from "vitest";
import type { MicroPlan } from "../schemas/plan";
import type { PlannedSession } from "../schemas/session";
import { computeWeeklyReview } from "./weekly-review";

const makeSession = (id: string, status: "planned" | "completed" | "skipped"): PlannedSession => ({
  id,
  date: "2026-10-26",
  sport: "running",
  type: "aerobic_base",
  title: "Corsa",
  durationMin: 45,
  intensity: { mode: "rpe", rpe: 6 },
  blocks: [],
  equipment: [],
  location: "outdoor",
  alternatives: [],
  contraindications: [],
  status,
});

const makePlan = (sessions: PlannedSession[]): MicroPlan => ({
  id: "micro_1",
  macroPlanId: "macro_1",
  weekIndex: 2,
  startDate: "2026-10-26",
  endDate: "2026-11-01",
  focus: "Base",
  weeklyVolumeMin: 135,
  deload: false,
  sessions,
  rationale: "Rationale",
  flags: [],
});

describe("computeWeeklyReview", () => {
  it("decides progress when adherence is high (>=80%) and no pain", () => {
    const micro = makePlan([
      makeSession("s1", "completed"),
      makeSession("s2", "completed"),
      makeSession("s3", "completed"),
    ]);

    const review = computeWeeklyReview({ userId: "u1", microPlan: micro });

    expect(review.adherencePct).toBe(100);
    expect(review.decision).toBe("progress");
    expect(review.painEventsCount).toBe(0);
    expect(review.nextCycleRecommendations.length).toBeGreaterThan(0);
  });

  it("decides deload when multiple pain events are logged", () => {
    const micro = makePlan([
      makeSession("s1", "completed"),
      makeSession("s2", "completed"),
      makeSession("s3", "completed"),
    ]);

    const review = computeWeeklyReview({
      userId: "u1",
      microPlan: micro,
      checkins: [
        {
          date: "2026-10-26",
          type: "morning",
          pain: [{ area: "knee", intensity: 5, sharp: false }],
        },
        {
          date: "2026-10-28",
          type: "morning",
          pain: [{ area: "knee", intensity: 6, sharp: true }],
        },
      ],
    });

    expect(review.decision).toBe("deload");
    expect(review.painEventsCount).toBe(2);
    expect(review.decisionRationale).toMatch(/scarico/i);
  });

  it("decides continue when adherence is lower than 60%", () => {
    const micro = makePlan([
      makeSession("s1", "completed"),
      makeSession("s2", "skipped"),
      makeSession("s3", "skipped"),
    ]);

    const review = computeWeeklyReview({ userId: "u1", microPlan: micro });

    expect(review.adherencePct).toBe(33);
    expect(review.decision).toBe("continue");
  });
});
