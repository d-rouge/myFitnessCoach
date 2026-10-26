import { describe, expect, it } from "vitest";
import type { Activity } from "../schemas/activity";
import type { PlannedSession } from "../schemas/session";
import { compareSessionWithActivity } from "./activity-comparison";

const sampleSession: PlannedSession = {
  id: "session_1",
  date: "2026-10-27",
  sport: "running",
  type: "aerobic_base",
  title: "Corsa Z2",
  durationMin: 50,
  intensity: { mode: "rpe", rpe: 6 },
  blocks: [],
  equipment: [],
  location: "outdoor",
  alternatives: [],
  contraindications: [],
  status: "planned",
};

const makeActivity = (durationMin: number, sport: "running" | "cycling" = "running"): Activity => ({
  userId: "user_1",
  source: "garmin",
  externalId: "act_101",
  sport,
  start: "2026-10-27T08:00:00Z",
  localDate: "2026-10-27",
  durationSec: durationMin * 60,
  distanceM: 8500,
  avgHr: 142,
  fetchedAt: "2026-10-27T09:00:00Z",
});

describe("compareSessionWithActivity", () => {
  it("scores 100% adherence when duration matches planned", () => {
    const activity = makeActivity(50);
    const result = compareSessionWithActivity(sampleSession, activity);

    expect(result.adherenceScore).toBe(100);
    expect(result.durationMatch).toBe("on_target");
    expect(result.durationDeltaMin).toBe(0);
    expect(result.flags).toHaveLength(0);
  });

  it("flags under-target when athlete cuts session short", () => {
    const activity = makeActivity(30);
    const result = compareSessionWithActivity(sampleSession, activity);

    expect(result.durationMatch).toBe("under");
    expect(result.durationDeltaMin).toBe(-20);
    expect(result.flags).toContain("duration_below_target");
    expect(result.adherenceScore).toBe(60);
  });

  it("flags over-target when session is much longer than planned", () => {
    const activity = makeActivity(75);
    const result = compareSessionWithActivity(sampleSession, activity);

    expect(result.durationMatch).toBe("over");
    expect(result.durationDeltaMin).toBe(25);
    expect(result.flags).toContain("duration_exceeded_target");
  });

  it("flags cross-sport substitution when sport differs", () => {
    const activity = makeActivity(50, "cycling");
    const result = compareSessionWithActivity(sampleSession, activity);

    expect(result.flags).toContain("cross_sport_substitution");
  });
});
