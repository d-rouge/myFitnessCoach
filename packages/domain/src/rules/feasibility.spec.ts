import { describe, expect, it } from "vitest";
import type { MicroPlan } from "../schemas/plan";
import type { CapacityActivity } from "./capacity";
import { assess5kGoal, project5k, riegelTime } from "./feasibility";
import { estimateFiveKFeasibility } from "./feasibility-context";

const activity = (localDate: string, distanceM: number, durationSec: number): CapacityActivity => ({
  sport: "running",
  start: `${localDate}T07:00:00.000Z`,
  localDate,
  durationSec,
  distanceM,
});

const microPlan = (
  sessions: Array<{ date: string; status: MicroPlan["sessions"][number]["status"] }>,
): MicroPlan => ({
  id: "micro-1",
  macroPlanId: "macro-1",
  weekIndex: 1,
  startDate: "2026-10-05",
  endDate: "2026-11-01",
  focus: "Test",
  weeklyVolumeMin: 120,
  deload: false,
  sessions: sessions.map((session, index) => ({
    id: `session-${index}`,
    date: session.date,
    sport: "running",
    type: "easy",
    title: "Corsa facile",
    durationMin: 30,
    intensity: { mode: "rpe", rpe: 4 },
    blocks: [],
    equipment: [],
    location: "outdoor",
    alternatives: [],
    contraindications: [],
    status: session.status,
  })),
  rationale: "Test",
  flags: [],
});

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

  it("non menziona l'aderenza quando non è fornita", () => {
    const projection = project5k({
      current5kSec: 1500,
      weeks: 12,
      tier: "trained",
      weeklyVolumeKm: 30,
    });

    expect(projection.rationale).not.toContain("aderenza");
    expect(projection.confidence).toBe("medium");
  });
});

describe("estimateFiveKFeasibility", () => {
  const now = "2026-10-30T08:00:00.000Z";
  const capacity = {
    lastActivityDate: "2026-10-29",
    activeWeeks: 8,
    weeklySessions: 4,
    longestRecentSessionMin: 120,
    recent5kSec: null,
    source: "garmin" as const,
    asOf: now,
  };

  const threeCompleted = microPlan([
    { date: "2026-10-20", status: "completed" },
    { date: "2026-10-22", status: "completed" },
    { date: "2026-10-24", status: "completed" },
    { date: "2026-10-25", status: "skipped" },
  ]);

  it("deriva riferimento, volume e orizzonte dai dati reali", () => {
    const result = estimateFiveKFeasibility({
      capacity,
      tier: "trained",
      targetDate: "2027-01-20",
      activities: [
        // 5 km in 30:00: proiezione diretta 1800 s.
        activity("2026-10-06", 5000, 1800),
        // 10 km in 60:00: Riegel lo proietta più lento dei 5 km secchi.
        activity("2026-10-10", 10000, 3600),
        // Fuori dalla finestra del volume (oltre 4 settimane fa).
        activity("2026-09-01", 12000, 4300),
      ],
      microPlans: [threeCompleted],
      now,
      timezone: "Europe/Rome",
    });

    expect(result.available).toBe(true);
    // Finestra volume 28 giorni: 15 km / 4 settimane.
    expect(result.weeklyVolumeKm).toBe(3.8);
    // Orizzonte dalla data obiettivo: 82 giorni → 12 settimane.
    expect(result.weeks).toBe(12);
    expect(result.reference?.localDate).toBe("2026-10-10");
    expect(result.reference?.projected5kSec).toBeLessThan(1800);
    expect(result.input?.current5kSec).toBe(result.reference?.projected5kSec);
    expect(result.current5kSource).toBe("reference");
    expect(result.sessionsCompleted).toBe(3);
    expect(result.projection?.projectedSec).toBeLessThan(result.input?.current5kSec ?? 0);
    expect(result.warnings).toEqual([]);
  });

  it("non parte finché non c'è una seduta completata", () => {
    const result = estimateFiveKFeasibility({
      capacity,
      tier: "trained",
      targetDate: "2027-01-20",
      activities: [activity("2026-10-03", 15080, 5291)],
      microPlans: [
        microPlan([
          { date: "2026-10-27", status: "planned" },
          { date: "2026-10-29", status: "planned" },
        ]),
      ],
      now,
      timezone: "Europe/Rome",
    });

    expect(result.available).toBe(false);
    expect(result.projection).toBeNull();
    expect(result.planStartedOn).toBeNull();
    expect(result.sessionsCompleted).toBe(0);
    expect(result.warnings).toContain("plan_not_started");
    expect(result.warnings).not.toContain("insufficient_completed_sessions");
  });

  it("conta le sedute dalla prima completata, non da 28 giorni fa", () => {
    const result = estimateFiveKFeasibility({
      capacity,
      tier: "trained",
      targetDate: "2027-01-20",
      activities: [activity("2026-10-03", 15080, 5291)],
      microPlans: [
        microPlan([
          // Inizio del piano oltre la finestra di 28 giorni: il loop parte qui.
          { date: "2026-09-01", status: "completed" },
          { date: "2026-09-03", status: "completed" },
          { date: "2026-09-05", status: "completed" },
          { date: "2026-09-08", status: "skipped" },
        ]),
      ],
      now,
      timezone: "Europe/Rome",
    });

    expect(result.available).toBe(true);
    expect(result.planStartedOn).toBe("2026-09-01");
    expect(result.sessionsCompleted).toBe(3);
    expect(result.warnings).toEqual([]);
  });

  it("non dà una stima con meno di tre sedute completate", () => {
    const result = estimateFiveKFeasibility({
      capacity,
      tier: "trained",
      targetDate: "2027-01-20",
      activities: [activity("2026-10-03", 15080, 5291)],
      microPlans: [
        microPlan([
          { date: "2026-10-20", status: "completed" },
          // Le sedute non marcate non sono esiti: non contano.
          { date: "2026-10-27", status: "planned" },
          { date: "2026-10-29", status: "planned" },
        ]),
      ],
      now,
      timezone: "Europe/Rome",
    });

    expect(result.available).toBe(false);
    expect(result.projection).toBeNull();
    expect(result.planStartedOn).toBe("2026-10-20");
    expect(result.sessionsCompleted).toBe(1);
    expect(result.sessionsRequired).toBe(3);
    expect(result.warnings).toContain("insufficient_completed_sessions");
  });

  it("dichiara non disponibile la stima quando mancano riferimento e obiettivo", () => {
    const result = estimateFiveKFeasibility({
      capacity: { ...capacity, recent5kSec: null },
      tier: "novice",
      targetDate: null,
      activities: [activity("2026-10-29", 2000, 800)],
      now,
      timezone: "Europe/Rome",
    });

    expect(result.available).toBe(false);
    expect(result.projection).toBeNull();
    expect(result.warnings).toContain("no_5k_reference");
    expect(result.warnings).toContain("no_target_date");
    expect(result.warnings).toContain("plan_not_started");
  });

  it("usa il tempo 5K della baseline quando le attività non bastano", () => {
    const result = estimateFiveKFeasibility({
      capacity: { ...capacity, recent5kSec: 1620 },
      tier: "trained",
      targetDate: "2027-01-20",
      activities: [activity("2026-10-20", 2000, 800)],
      microPlans: [threeCompleted],
      now,
      timezone: "Europe/Rome",
    });

    expect(result.available).toBe(true);
    expect(result.reference).toBeNull();
    expect(result.input?.current5kSec).toBe(1620);
    expect(result.current5kSource).toBe("measured");
    expect(result.warnings).toEqual([]);
  });

  it("preferisce la stima 5K dichiarata (es. Garmin) alla proiezione Riegel", () => {
    const result = estimateFiveKFeasibility({
      capacity: { ...capacity, recent5kSec: 1500, recent5kSource: "declared" },
      tier: "trained",
      targetDate: "2027-01-20",
      activities: [activity("2026-10-03", 15080, 5291)],
      microPlans: [threeCompleted],
      now,
      timezone: "Europe/Rome",
    });

    expect(result.available).toBe(true);
    // Il riferimento Riegel resta esposto per spiegare la differenza...
    expect(result.reference?.projected5kSec).toBeGreaterThan(1500);
    // ...ma la base della proiezione è il tempo dichiarato.
    expect(result.current5kSource).toBe("declared");
    expect(result.input?.current5kSec).toBe(1500);
  });
});
