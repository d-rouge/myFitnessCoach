import { describe, expect, it } from "vitest";
import { beginnerPersona } from "../fixtures/personas";
import { BaselineSchema } from "../schemas/baseline";
import { CheckinSchema } from "../schemas/checkin";
import { MacroPlanSchema, MicroPlanSchema } from "../schemas/plan";
import { ProfileSchema } from "../schemas/profile";
import { PlannedSessionSchema } from "../schemas/session";
import {
  buildAthleteDossier,
  DOSSIER_BASELINE_SOURCES,
  DOSSIER_PROFILE_SOURCES,
  DOSSIER_UNUSED_YET,
} from "./athlete-dossier";

const NOW = "2026-10-27T10:00:00.000Z";

const baseline = {
  ...beginnerPersona,
  profile: {
    ...beginnerPersona.profile,
    birthDate: "1992-05-14",
    timezone: "Europe/Rome",
  },
  goals: {
    primary: beginnerPersona.goals.primary,
    secondary: [
      {
        ...beginnerPersona.goals.primary,
        description: "Aggiungere due sedute di forza",
        priority: "secondary" as const,
      },
    ],
  },
};

function session(date: string, rpe: number, status: "planned" | "completed" | "skipped") {
  return PlannedSessionSchema.parse({
    id: `sess_${date}`,
    date,
    sport: "running",
    type: "aerobic_base",
    title: "Corsa facile",
    durationMin: 40,
    intensity: { mode: "rpe", rpe },
    status,
  });
}

function microPlan(weekIndex: number, startDate: string, sessions: unknown[]) {
  return MicroPlanSchema.parse({
    id: `micro_w${weekIndex}`,
    macroPlanId: "macro_1",
    weekIndex,
    startDate,
    endDate: startDate,
    focus: `Settimana ${weekIndex}`,
    rationale: "test",
    sessions,
  });
}

const marathon = {
  sport: "running" as const,
  localDate: "2026-10-25",
  durationSec: 17_490,
  distanceM: 42_641,
};

describe("buildAthleteDossier", () => {
  it("calcola l'età senza contare il compleanno non ancora arrivato", () => {
    const dossier = buildAthleteDossier({ baseline, now: NOW });
    // Nato il 14 maggio 1992, al 27 ottobre 2026: 34 anni.
    expect(dossier.identity.ageYears).toBe(34);
  });

  it("porta obiettivi primario e secondari, invece di scartare i secondari", () => {
    const dossier = buildAthleteDossier({ baseline, now: NOW });

    expect(dossier.goals.primary.description).toBe(beginnerPersona.goals.primary.description);
    expect(dossier.goals.secondary).toHaveLength(1);
    expect(dossier.goals.secondary[0]?.description).toMatch(/forza/i);
  });

  it("passa al dossier la storia sportiva generale senza confonderla con il dato Garmin", () => {
    const dossier = buildAthleteDossier({
      baseline: {
        ...baseline,
        profile: { ...baseline.profile, athleteBackground: "elite" },
      },
      now: NOW,
    });

    expect(dossier.athleteBackground).toBe("elite");
    expect(dossier.recentContext.lastActivityDate).toBeNull();
    expect(dossier.warnings).not.toContain("no_athletic_background");
  });

  it("dichiara ciò che manca invece di inventare zeri", () => {
    const dossier = buildAthleteDossier({ baseline, now: NOW });

    expect(dossier.warnings).toEqual(
      expect.arrayContaining([
        "no_activities",
        "no_checkins",
        "no_plan_history",
        "no_adherence",
        "no_rpe_feedback",
      ]),
    );
    expect(dossier.individualResponse.adherencePct).toBeNull();
    expect(dossier.individualResponse.rpeDrift).toBeNull();
  });

  it("calcola aderenza e scarto RPE sulla finestra di 28 giorni", () => {
    const plans = [
      microPlan(4, "2026-10-19", [
        session("2026-10-20", 5, "completed"),
        session("2026-10-22", 7, "completed"),
        session("2026-10-24", 5, "skipped"),
      ]),
    ];
    const checkins = [
      CheckinSchema.parse({ date: "2026-10-20", type: "post_session", rpe: 6 }),
      CheckinSchema.parse({ date: "2026-10-22", type: "post_session", rpe: 8 }),
      // Fuori dalla finestra: non deve entrare nelle medie.
      CheckinSchema.parse({ date: "2026-08-01", type: "post_session", rpe: 10 }),
    ];

    const dossier = buildAthleteDossier({
      baseline,
      now: NOW,
      microPlans: plans,
      checkins,
    });

    expect(dossier.individualResponse.sessionsPlanned).toBe(3);
    expect(dossier.individualResponse.sessionsCompleted).toBe(2);
    expect(dossier.individualResponse.adherencePct).toBe(67);
    expect(dossier.individualResponse.rpeSamples).toBe(2);
    // (6-5) e (8-7) → +1 di media: le sedute costano più del prescritto.
    expect(dossier.individualResponse.rpeDrift).toBe(1);
  });

  it("include le ultime due settimane con il tipo di seduta", () => {
    const dossier = buildAthleteDossier({
      baseline,
      now: NOW,
      activities: [
        {
          sport: "running",
          localDate: "2026-10-26",
          durationSec: 45 * 60,
          distanceM: 10_000,
          avgPaceSecKm: 270,
          trainingEffect: 4.6,
          title: "Ripetute in soglia",
          activityType: "running",
        },
      ],
    });

    expect(dossier.trainingHistory.summary.sessions).toBe(1);
    expect(dossier.trainingHistory.entries[0]?.kind).toBe("quality");
    expect(dossier.trainingHistory.entries[0]?.activityType).toBe("running");
  });

  it("segnala il dolore ricorrente, non il singolo episodio", () => {
    const checkins = [
      CheckinSchema.parse({
        date: "2026-10-20",
        type: "morning",
        pain: [{ area: "ginocchio destro", intensity: 3 }],
      }),
      CheckinSchema.parse({
        date: "2026-10-23",
        type: "morning",
        pain: [{ area: "ginocchio destro", intensity: 4 }],
      }),
      CheckinSchema.parse({
        date: "2026-10-25",
        type: "morning",
        pain: [{ area: "spalla sinistra", intensity: 2 }],
      }),
    ];

    const dossier = buildAthleteDossier({ baseline, now: NOW, checkins });

    expect(dossier.individualResponse.painEvents).toBe(3);
    expect(dossier.individualResponse.recurringPainAreas).toEqual(["ginocchio destro"]);
  });

  it("include il contesto recente con la finestra post-gara", () => {
    const dossier = buildAthleteDossier({ baseline, now: NOW, activities: [marathon] });

    expect(dossier.recentContext.postRaceRecovery.active).toBe(true);
    expect(dossier.recentContext.lastLongEffort?.label).toMatch(/maratona/i);
    expect(dossier.warnings).not.toContain("no_activities");
  });

  it("include la data di ultima attività dichiarata se non ci sono dati importati", () => {
    const dossier = buildAthleteDossier({
      baseline: {
        ...baseline,
        profile: {
          ...baseline.profile,
          capacity: {
            ...baseline.profile.capacity,
            lastActivityDate: "2026-10-10",
          },
        },
      },
      now: NOW,
    });

    expect(dossier.recentContext.lastActivityDate).toBe("2026-10-10");
    expect(dossier.recentContext.daysSinceLastActivity).toBe(17);
    expect(dossier.recentContext.flags).toContain("detraining_gap");
  });

  it("ricostruisce la memoria del piano: fase, settimana e finestra di recupero", () => {
    const macroPlan = MacroPlanSchema.parse({
      id: "macro_1",
      goalDescription: "Completare un 5k in meno di 28 minuti",
      startDate: "2026-10-27",
      endDate: "2026-12-21",
      totalWeeks: 8,
      phases: [
        {
          name: "Costruzione Base Aerobica",
          startWeek: 1,
          endWeek: 4,
          focus: "Volume a bassa intensità",
        },
        { name: "Sviluppo", startWeek: 5, endWeek: 8, focus: "Intensità" },
      ],
      rationale: "test",
      recoveryWindow: { weeks: 3, reason: "maratona", untilDate: "2026-11-15" },
    });
    const microPlans = [microPlan(1, "2026-10-27", []), microPlan(2, "2026-11-03", [])];

    const dossier = buildAthleteDossier({
      baseline,
      now: NOW,
      macroPlan,
      microPlans,
      activities: [marathon],
    });

    expect(dossier.planMemory.weekIndex).toBe(2);
    expect(dossier.planMemory.phaseName).toBe("Costruzione Base Aerobica");
    expect(dossier.planMemory.totalWeeks).toBe(8);
    expect(dossier.planMemory.recoveryWindow).toEqual({
      weeks: 3,
      untilDate: "2026-11-15",
    });
    // Il metodo non è ancora un campo del piano: deve essere dichiarato nullo.
    expect(dossier.planMemory.method).toBeNull();
  });

  it("ordina lo storico dei piani dal più recente e lo limita", () => {
    const microPlans = Array.from({ length: 8 }, (_value, index) =>
      microPlan(index + 1, `2026-09-${String(index + 1).padStart(2, "0")}`, []),
    );

    const dossier = buildAthleteDossier({ baseline, now: NOW, microPlans });

    expect(dossier.planHistory).toHaveLength(6);
    expect(dossier.planHistory[0]?.weekIndex).toBe(8);
  });

  it("è deterministico: stesso input, stesso dossier", () => {
    const input = { baseline, now: NOW, activities: [marathon] };
    expect(buildAthleteDossier(input)).toEqual(buildAthleteDossier(input));
  });
});

describe("copertura del profilo", () => {
  it("ogni campo della baseline è consumato dal dossier o dichiarato non usato", () => {
    // Campi di identità/versionamento: non sono contesto.
    const bookkeeping = ["id", "userId", "version", "validFrom", "supersededAt"];
    const schemaKeys = Object.keys(BaselineSchema.shape)
      .filter((key) => !bookkeeping.includes(key))
      .sort();
    const handled = [...DOSSIER_BASELINE_SOURCES, ...DOSSIER_UNUSED_YET].sort();

    // Se aggiungi un campo alla baseline, passalo al dossier oppure elencalo in
    // DOSSIER_UNUSED_YET con il motivo. Non deve sparire nel nulla.
    expect(schemaKeys).toEqual(handled);
  });

  it("ogni campo del profilo è consumato dal dossier", () => {
    const profileKeys = Object.keys(ProfileSchema.shape).sort();
    expect(profileKeys).toEqual([...DOSSIER_PROFILE_SOURCES].sort());
  });
});
