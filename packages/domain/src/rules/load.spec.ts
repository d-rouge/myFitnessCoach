import { describe, expect, it } from "vitest";
import { computeAcwr, loadSummary, monotony, srpeLoad, strain, weeklyLoad } from "./load";

describe("load", () => {
  it("computes sRPE load", () => {
    expect(srpeLoad(7, 60)).toBe(420);
    expect(srpeLoad(3, 45)).toBe(135);
  });

  it("rejects invalid RPE", () => {
    expect(() => srpeLoad(11, 60)).toThrow(/RPE/);
    expect(() => srpeLoad(5, -1)).toThrow(/Minutes/);
  });

  it("flags ACWR zones", () => {
    expect(computeAcwr(600, 500)).toEqual({ ratio: 1.2, flag: "optimal" });
    expect(computeAcwr(700, 500).flag).toBe("high");
    expect(computeAcwr(300, 500).flag).toBe("low");
    expect(computeAcwr(0, 0).flag).toBe("unknown");
  });

  it("computes monotony and strain", () => {
    expect(weeklyLoad([100, 100, 100])).toBe(300);
    expect(monotony([100, 100, 100])).toBe(0);
    expect(monotony([50, 100, 150])).toBeGreaterThan(0);
    expect(strain([50, 100, 150])).toBeGreaterThan(0);
  });

  it("summarizes the last 7 and 28 days", () => {
    const days = Array.from({ length: 28 }, (_, index) => ({
      date: `2026-10-${String(index + 1).padStart(2, "0")}`,
      load: index >= 21 ? 100 : 50,
    }));

    const summary = loadSummary(days);

    expect(summary.acute7).toBe(700);
    expect(summary.chronic28).toBe(1750);
    expect(summary.acwr.ratio).toBeGreaterThan(1);
  });
});
