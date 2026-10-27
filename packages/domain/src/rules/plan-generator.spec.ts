import { describe, expect, it, vi } from "vitest";
import { beginnerPersona, intermediatePersona, kneePainPersona } from "../fixtures/personas";
import type { Baseline } from "../schemas/baseline";
import { generateMacroPlan, generateMicroPlan, goalPaceText } from "./plan-generator";
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

    it("starts today (athlete timezone) when no start date is requested", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
      try {
        const plan = generateMacroPlan(beginnerPersona);
        expect(plan.startDate).toBe("2026-10-27");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("generateMicroPlan", () => {
    it("respects the primary goal sport instead of always prescribing running", () => {
      const cyclingBaseline: Baseline = {
        ...beginnerPersona,
        profile: { ...beginnerPersona.profile, sports: ["cycling"] },
        goals: {
          ...beginnerPersona.goals,
          primary: { ...beginnerPersona.goals.primary, sport: "cycling" },
        },
      };

      const macro = generateMacroPlan(cyclingBaseline, { startDate: "2026-11-02" });
      const micro = generateMicroPlan(cyclingBaseline, macro, 1);

      expect(micro.sessions.length).toBeGreaterThan(0);
      expect(micro.sessions.every((session) => session.sport === "cycling")).toBe(true);
      expect(micro.sessions.some((session) => session.sport === "running")).toBe(false);
    });

    it("starts a Tuesday plan today and keeps sessions on the athlete's weekdays", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
      try {
        const macro = generateMacroPlan(beginnerPersona);
        const micro = generateMicroPlan(beginnerPersona, macro, 1);

        expect(micro.startDate).toBe("2026-10-27");
        expect(micro.sessions.map((session) => session.date)).toEqual([
          "2026-10-27",
          "2026-10-29",
          "2026-10-31",
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("never plans blocks longer than the available session duration", () => {
      const shortBaseline: Baseline = {
        ...beginnerPersona,
        availability: {
          ...beginnerPersona.availability,
          days: beginnerPersona.availability.days.map((day) => ({
            ...day,
            maxDurationMin: 20,
          })),
        },
      };

      const macro = generateMacroPlan(shortBaseline, { startDate: "2026-11-02" });
      const micro = generateMicroPlan(shortBaseline, macro, 1);

      for (const session of micro.sessions) {
        const plannedMinutes = session.blocks.reduce(
          (total, block) =>
            total +
            block.repeat * block.steps.reduce((sum, step) => sum + (step.durationMin ?? 0), 0),
          0,
        );
        expect(session.durationMin).toBeLessThanOrEqual(20);
        expect(plannedMinutes).toBeLessThanOrEqual(session.durationMin);
      }

      const issues = validatePlanSessions(micro.sessions);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });

    it("derives target pace from the goal instead of hardcoding one", () => {
      expect(goalPaceText(beginnerPersona)).toBe("5:36");

      const macro = generateMacroPlan(intermediatePersona, { startDate: "2026-11-02" });
      const micro = generateMicroPlan(intermediatePersona, macro, 1);
      const serialized = JSON.stringify(micro.sessions);

      expect(serialized).not.toContain("4:20-4:35");
    });
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
