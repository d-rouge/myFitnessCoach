import { describe, expect, it } from "vitest";
import { assess5kGoal, project5k, riegelTime } from "./feasibility";

describe("feasibility", () => {
  it("applies Riegel", () => {
    const tenK = riegelTime(1200, 5000, 10000);
    expect(tenK).toBeGreaterThan(2400);
    expect(tenK).toBeLessThan(2600);
  });

  it("calls a 24:00 to 20:00 jump in 12 weeks unrealistic", () => {
    const assessment = assess5kGoal({
      current5kSec: 24 * 60,
      target5kSec: 20 * 60,
      weeks: 12,
      tier: "trained",
      weeklyVolumeKm: 35,
      adherence: 0.8,
    });

    expect(assessment.verdict).toBe("unrealistic");
    expect(assessment.weeklyImprovementPct).toBeGreaterThan(0);
  });

  it("calls a 21:30 to 20:00 goal ambitious but not impossible", () => {
    const assessment = assess5kGoal({
      current5kSec: 21 * 60 + 30,
      target5kSec: 20 * 60,
      weeks: 12,
      tier: "trained",
      weeklyVolumeKm: 45,
      adherence: 0.9,
    });

    expect(assessment.verdict).toBe("ambitious");
    expect(assessment.bestSec).toBeLessThan(assessment.worstSec);
    expect(assessment.confidence).toBe("high");
  });

  it("projects slower times with low adherence", () => {
    const high = project5k({
      current5kSec: 1500,
      weeks: 12,
      tier: "novice",
      weeklyVolumeKm: 30,
      adherence: 0.9,
    });
    const low = project5k({
      current5kSec: 1500,
      weeks: 12,
      tier: "novice",
      weeklyVolumeKm: 30,
      adherence: 0.4,
    });

    expect(low.projectedSec).toBeGreaterThan(high.projectedSec);
  });
});
