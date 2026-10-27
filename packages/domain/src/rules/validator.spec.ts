import { describe, expect, it } from "vitest";
import type { MacroPlan } from "../schemas/plan";
import type { PlannedSession } from "../schemas/session";
import { validateMacroPlan, validatePlannedSession } from "./validator";

const validPlan: MacroPlan = {
  id: "p1",
  goalDescription: "5k sub 20",
  startDate: "2026-11-02",
  endDate: "2027-01-24",
  totalWeeks: 12,
  phases: [
    { name: "Base", startWeek: 1, endWeek: 4, focus: "volume", deload: false },
    { name: "Build", startWeek: 5, endWeek: 9, focus: "intensity", deload: false },
    { name: "Taper", startWeek: 10, endWeek: 12, focus: "race", deload: true },
  ],
  rationale: "Goal is realistic with the current volume.",
  assumptions: [],
  flags: [],
};

const validSession: PlannedSession = {
  id: "s1",
  date: "2026-11-03",
  sport: "running",
  type: "interval",
  title: "6x800",
  durationMin: 55,
  intensity: { mode: "pace", target: "4:00/km" },
  blocks: [
    {
      repeat: 1,
      steps: [{ kind: "warmup", durationMin: 15 }],
    },
  ],
  equipment: [],
  location: "outdoor",
  alternatives: [],
  contraindications: [],
  status: "planned",
};

describe("validator", () => {
  it("accepts a coherent macro plan", () => {
    expect(validateMacroPlan(validPlan)).toEqual([]);
  });

  it("detects a gap between phases", () => {
    const broken: MacroPlan = {
      ...validPlan,
      phases: [
        { name: "Base", startWeek: 1, endWeek: 4, focus: "volume", deload: false },
        { name: "Build", startWeek: 6, endWeek: 12, focus: "intensity", deload: false },
      ],
    };

    expect(validateMacroPlan(broken).map((issue) => issue.code)).toContain("phase_gap");
  });

  it("detects a plan that does not cover the last week", () => {
    const broken: MacroPlan = {
      ...validPlan,
      phases: [{ name: "Base", startWeek: 1, endWeek: 8, focus: "volume", deload: false }],
    };

    expect(validateMacroPlan(broken).map((issue) => issue.code)).toContain("phase_coverage");
  });

  it("detects contraindications", () => {
    const issues = validatePlannedSession(
      { ...validSession, contraindications: ["knee_pain_acute"] },
      ["knee_pain_acute"],
    );

    expect(issues.map((issue) => issue.code)).toContain("contraindication");
  });

  it("detects blocks longer than the session", () => {
    const issues = validatePlannedSession({
      ...validSession,
      durationMin: 20,
      blocks: [
        { repeat: 1, steps: [{ kind: "warmup", durationMin: 15 }] },
        { repeat: 2, steps: [{ kind: "work", durationMin: 10 }] },
      ],
    });

    expect(issues.map((issue) => issue.code)).toContain("session_blocks_overflow");
  });
});
