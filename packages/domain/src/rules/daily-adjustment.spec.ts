import { describe, expect, it } from "vitest";
import type { Checkin } from "../schemas/checkin";
import type { PlannedSession } from "../schemas/session";
import { computeDailyAdjustment } from "./daily-adjustment";

const mockSession: PlannedSession = {
  id: "session_sample_1",
  date: "2026-10-27",
  sport: "running",
  type: "aerobic_base",
  title: "Corsa Media Z2",
  durationMin: 50,
  intensity: { mode: "rpe", rpe: 7, target: "Z2/Z3" },
  blocks: [
    {
      repeat: 1,
      steps: [
        { kind: "warmup", durationMin: 10 },
        { kind: "work", durationMin: 35 },
        { kind: "cooldown", durationMin: 5 },
      ],
    },
  ],
  equipment: [],
  location: "outdoor",
  alternatives: [
    { label: "Versione 15 min (Espressa)", changes: "Corsa/mobilità rapida 15 min" },
    { label: "Versione 30 min (Compressa)", changes: "Corsa 30 min" },
  ],
  contraindications: [],
  status: "planned",
};

describe("daily-adjustment", () => {
  it("confirms planned session when all metrics are good", () => {
    const checkin: Checkin = {
      date: "2026-10-27",
      type: "morning",
      energy: 4,
      sleepQuality: 4,
      soreness: 1,
      pain: [],
      availableTimeMin: 60,
    };

    const res = computeDailyAdjustment({ checkin, session: mockSession, readinessScore: 82 });

    expect(res.decision).toBe("confirm");
    expect(res.flags).toContain("ready_to_train");
    expect(res.adjustedSession?.durationMin).toBe(50);
  });

  it("swaps to a compressed session when available time is restricted", () => {
    const checkin: Checkin = {
      date: "2026-10-27",
      type: "morning",
      energy: 4,
      pain: [],
      availableTimeMin: 30, // less than 50 min
    };

    const res = computeDailyAdjustment({ checkin, session: mockSession });

    expect(res.decision).toBe("swap");
    expect(res.flags).toContain("time_constrained");
    expect(res.adjustedSession?.durationMin).toBeLessThanOrEqual(30);
    expect(res.changes.length).toBeGreaterThan(0);
  });

  it("reduces volume and intensity when athlete has low energy or high soreness", () => {
    const checkin: Checkin = {
      date: "2026-10-27",
      type: "morning",
      energy: 2, // low
      soreness: 4, // high
      pain: [],
      availableTimeMin: 60,
    };

    const res = computeDailyAdjustment({ checkin, session: mockSession });

    expect(res.decision).toBe("reduce");
    expect(res.flags).toContain("low_energy");
    expect(res.flags).toContain("high_muscle_soreness");
    expect(res.adjustedSession?.durationMin).toBeLessThan(50);
    expect(res.adjustedSession?.intensity.rpe).toBeLessThanOrEqual(5);
  });

  it("substitutes session with rest and passive mobility when acute pain is reported", () => {
    const checkin: Checkin = {
      date: "2026-10-27",
      type: "morning",
      energy: 3,
      pain: [{ area: "patellar_tendon", intensity: 7, sharp: true }],
      availableTimeMin: 60,
    };

    const res = computeDailyAdjustment({ checkin, session: mockSession });

    expect(res.decision).toBe("rest");
    expect(res.flags).toContain("acute_pain_detected");
    expect(res.adjustedSession?.durationMin).toBe(15);
    expect(res.adjustedSession?.sport).toBe("mobility");
  });

  it("handles rest days gracefully when no session is planned", () => {
    const checkin: Checkin = {
      date: "2026-10-27",
      type: "morning",
      energy: 4,
      pain: [],
    };

    const res = computeDailyAdjustment({ checkin, session: null });

    expect(res.decision).toBe("confirm");
    expect(res.flags).toContain("rest_day");
    expect(res.adjustedSession).toBeUndefined();
  });
});
