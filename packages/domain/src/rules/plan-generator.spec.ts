import { describe, expect, it } from "vitest";
import { beginnerPersona, intermediatePersona, kneePainPersona } from "../fixtures/personas";
import { generateMacroPlan, generateMicroPlan } from "./plan-generator";
import { validateMacroPlan, validatePlanSessions } from "./validator";

describe("plan-generator", () => {
  describe("generateMacroPlan", () => {
    it("generates a valid 8-week plan for beginner runner", () => {
      const plan = generateMacroPlan(beginnerPersona, { startDate: "2026-11-02" });

      expect(plan.totalWeeks).toBe(8);
      expect(plan.startDate).toBe("2026-11-02");
      expect(plan.endDate).toBe("2026-12-27");
      expect(plan.phases.length).toBeGreaterThanOrEqual(2);
      expect(plan.phases[0].startWeek).toBe(1);
      expect(plan.phases.at(-1)?.endWeek).toBe(8);

      const issues = validateMacroPlan(plan);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });

    it("generates a 12-week plan for race goal", () => {
      const plan = generateMacroPlan(intermediatePersona, { startDate: "2026-11-02" });

      expect(plan.totalWeeks).toBe(12);
      expect(plan.startDate).toBe("2026-11-02");
      expect(plan.endDate).toBe("2027-01-24");
      expect(plan.phases.length).toBe(3);

      const issues = validateMacroPlan(plan);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });

    it("generates low-impact adapted phases when athlete has knee pain", () => {
      const plan = generateMacroPlan(kneePainPersona, { startDate: "2026-11-02" });

      expect(plan.flags).toContain("caution_knee_pain");
      expect(plan.phases[0].focus).toMatch(/bici|scarico/i);

      const issues = validateMacroPlan(plan);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });
  });

  describe("generateMicroPlan", () => {
    it("generates sessions matching athlete availability", () => {
      const macro = generateMacroPlan(beginnerPersona, { startDate: "2026-11-02" });
      const micro = generateMicroPlan(beginnerPersona, macro, 1);

      expect(micro.weekIndex).toBe(1);
      expect(micro.sessions).toHaveLength(beginnerPersona.availability.days.length);

      for (const session of micro.sessions) {
        expect(session.durationMin).toBeGreaterThan(0);
        expect(session.alternatives).toHaveLength(3);
        expect(session.blocks.length).toBeGreaterThan(0);
      }

      const issues = validatePlanSessions(micro.sessions);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });

    it("safely substitutes impact running with cycling/swimming/mobility for knee pain", () => {
      const macro = generateMacroPlan(kneePainPersona, { startDate: "2026-11-02" });
      const micro = generateMicroPlan(kneePainPersona, macro, 1);

      expect(micro.sessions.length).toBe(kneePainPersona.availability.days.length);
      const sports = micro.sessions.map((s) => s.sport);
      expect(sports).not.toContain("running");
      expect(sports.some((s) => s === "cycling" || s === "swimming" || s === "mobility")).toBe(
        true,
      );

      const issues = validatePlanSessions(micro.sessions, ["knee_impact_high"]);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });

    it("flags deload on week 4 and scales volume accordingly", () => {
      const macro = generateMacroPlan(intermediatePersona, { startDate: "2026-11-02" });
      const week3 = generateMicroPlan(intermediatePersona, macro, 3);
      const week4 = generateMicroPlan(intermediatePersona, macro, 4);

      expect(week4.deload).toBe(true);
      expect(week4.flags).toContain("deload_week");
      expect(week4.weeklyVolumeMin).toBeLessThan(week3.weeklyVolumeMin);
    });
  });
});
