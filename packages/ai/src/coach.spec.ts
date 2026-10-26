import type { PlannedSession } from "@health-trainer/domain";
import { describe, expect, it } from "vitest";
import {
  CoachAdviceSchema,
  DeterministicCoachProvider,
  generateDeterministicCoachAdvice,
} from "./index.js";

const sampleRunSession: PlannedSession = {
  id: "sess_run_01",
  date: "2026-10-27",
  sport: "running",
  type: "run",
  title: "Corsa Facile 40'",
  durationMin: 40,
  intensity: { mode: "rpe", rpe: 4, target: "Z2" },
  successCriteria: "Resistenza aerobica di base",
  blocks: [],
  equipment: [],
  location: "outdoor",
  alternatives: [],
  contraindications: [],
  status: "planned",
};

describe("generateDeterministicCoachAdvice", () => {
  it("generates advice for optimal readiness", () => {
    const advice = generateDeterministicCoachAdvice({
      athleteName: "Marco",
      tone: "supportive",
      session: sampleRunSession,
      readinessBand: "optimal",
    });

    expect(advice.headline).toContain("Corsa Facile 40'");
    expect(advice.workoutFocus).toContain("Resistenza aerobica");
    expect(advice.tips.length).toBeGreaterThan(0);
    expect(advice.caution).toBeUndefined();
    expect(CoachAdviceSchema.safeParse(advice).success).toBe(true);
  });

  it("handles impaired readiness and pain reports with cautious advice", () => {
    const advice = generateDeterministicCoachAdvice({
      athleteName: "Luca",
      tone: "direct",
      session: sampleRunSession,
      readinessBand: "impaired",
      checkin: {
        date: "2026-10-27",
        type: "morning",
        sleepQuality: 2,
        energy: 2,
        soreness: 4,
        availableTimeMin: 30,
        pain: [{ area: "ginocchio destro", intensity: 6, sharp: true }],
      },
    });

    expect(advice.headline).toContain("Attenzione al recupero");
    expect(advice.readinessSummary).toContain("ginocchio destro");
    expect(advice.caution).toBeDefined();
    expect(advice.caution).toContain("ginocchio destro");
    expect(CoachAdviceSchema.safeParse(advice).success).toBe(true);
  });
});

describe("DeterministicCoachProvider", () => {
  it("implements LlmProvider and returns schema validated response", async () => {
    const provider = new DeterministicCoachProvider();
    const response = await provider.generate({
      task: "daily",
      system: "coach",
      user: JSON.stringify({
        athleteName: "Giulia",
        session: sampleRunSession,
        readinessBand: "manageable",
      }),
      schema: CoachAdviceSchema,
    });

    expect(response.provider).toBe("managed");
    expect(response.model).toBe("deterministic-coach-v1");
    expect(response.data.headline).toContain("Corsa Facile 40'");
    expect(response.usage.outputTokens).toBeGreaterThan(0);
  });
});
