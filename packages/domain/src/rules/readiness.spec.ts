import { describe, expect, it } from "vitest";
import { computeReadiness, readinessDecision } from "./readiness";

describe("computeReadiness", () => {
  it("scores a well-recovered athlete high", () => {
    const result = computeReadiness({
      hrvToday: 70,
      hrvBaseline: { mean: 60, sd: 5 },
      rhrToday: 48,
      rhrBaseline: { mean: 52, sd: 3 },
      sleepMinutes: 480,
      sleepNeedMinutes: 480,
      subjective: { energy: 4, mood: 4, stress: 2, soreness: 1 },
    });

    expect(result.score).toBeGreaterThan(80);
    expect(result.confidence).toBe("high");
    expect(result.flags).not.toContain("low_hrv");
    expect(readinessDecision(result.score)).toBe("proceed");
  });

  it("scores a fatigued athlete low and raises flags", () => {
    const result = computeReadiness({
      hrvToday: 40,
      hrvBaseline: { mean: 60, sd: 5 },
      rhrToday: 62,
      rhrBaseline: { mean: 52, sd: 3 },
      sleepMinutes: 300,
      sleepNeedMinutes: 480,
      subjective: { energy: 2, mood: 2, stress: 4, soreness: 4 },
    });

    expect(result.score).toBeLessThan(45);
    expect(result.confidence).toBe("high");
    expect(result.flags).toEqual(
      expect.arrayContaining(["low_hrv", "elevated_rhr", "sleep_debt", "high_soreness"]),
    );
  });

  it("falls back to subjective data without a wearable", () => {
    const result = computeReadiness({
      subjective: { energy: 3, mood: 3, stress: 3, soreness: 2 },
    });

    expect(result.confidence).toBe("low");
    expect(result.components.hrv).toBeUndefined();
    expect(result.score).toBeGreaterThan(50);
  });
});
