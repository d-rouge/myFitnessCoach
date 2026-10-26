import type { Baseline } from "../schemas/baseline";
import type { Sport } from "../schemas/common";
import type { MacroPlan, MicroPlan, PlanPhase } from "../schemas/plan";
import type { PlannedSession, SessionAlternative, SessionBlock } from "../schemas/session";
import { isDeloadWeek } from "./progression";
import { validateMacroPlan, validatePlanSessions } from "./validator";

export interface MacroPlanOptions {
  startDate?: string;
  totalWeeks?: number;
}

export interface MicroPlanOptions {
  startDate?: string;
}

const DAY_OFFSETS: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getNextMonday(): string {
  const today = new Date();
  const day = today.getUTCDay();
  // day 0 is Sunday, 1 is Monday...
  const daysUntilNextMon = day === 0 ? 1 : (8 - day) % 7 || 7;
  const nextMon = new Date(today);
  nextMon.setUTCDate(today.getUTCDate() + daysUntilNextMon);
  return nextMon.toISOString().slice(0, 10);
}

export function generateMacroPlan(baseline: Baseline, options?: MacroPlanOptions): MacroPlan {
  const startDate = options?.startDate ?? getNextMonday();
  const totalWeeks = options?.totalWeeks ?? (baseline.goals.primary.type === "race" ? 12 : 8);
  const endDate = addDays(startDate, totalWeeks * 7 - 1);

  const goalType = baseline.goals.primary.type;
  const isKneePain = baseline.anamnesis.injuries.some(
    (i) => i.area.includes("knee") && i.painLevel >= 4,
  );

  let phases: PlanPhase[];

  if (isKneePain) {
    phases = [
      {
        name: "Scarico articolare & Adattamento aerobico a basso impatto",
        startWeek: 1,
        endWeek: Math.floor(totalWeeks / 2),
        focus:
          "Bici, nuoto e mobilità per preservare il ginocchio stimolando la capacità cardiovascolare.",
        weeklyVolumeMin: 150,
        deload: false,
      },
      {
        name: "Rinforzo catena cinetica & Rientro progressivo",
        startWeek: Math.floor(totalWeeks / 2) + 1,
        endWeek: totalWeeks,
        focus: "Rinforzo isocinetico, stabilità del core e reintroduzione cauta del carico.",
        weeklyVolumeMin: 180,
        deload: false,
      },
    ];
  } else if (goalType === "race" || goalType === "performance") {
    const baseEnd = Math.max(2, Math.floor(totalWeeks * 0.4));
    const buildEnd = totalWeeks - 2;

    phases = [
      {
        name: "Costruzione Base Aerobica",
        startWeek: 1,
        endWeek: baseEnd,
        focus: "Volume a bassa intensità (Z2), economia di corsa e mobilità fondamentale.",
        weeklyVolumeMin: 160,
        deload: false,
      },
      {
        name: "Sviluppo Soglia e Ritmo Gara",
        startWeek: baseEnd + 1,
        endWeek: buildEnd,
        focus: "Intervalli guidati, tempo run e tenuta al ritmo target.",
        weeklyVolumeMin: 210,
        deload: isDeloadWeek(buildEnd),
      },
      {
        name: "Picco, Tapering & Consolidamento",
        startWeek: buildEnd + 1,
        endWeek: totalWeeks,
        focus: "Mantenimento brillantezza neuromuscolare, riduzione del volume e freschezza.",
        weeklyVolumeMin: 130,
        deload: true,
      },
    ];
  } else {
    // Salute, habit, o forza
    const mid = Math.floor(totalWeeks / 2);
    phases = [
      {
        name: "Costruzione Routine & Resistenza di Base",
        startWeek: 1,
        endWeek: mid,
        focus: "Costanza nelle sessioni, padronanza dei movimenti e recupero.",
        weeklyVolumeMin: 150,
        deload: false,
      },
      {
        name: "Progressione & Forza Funzionale",
        startWeek: mid + 1,
        endWeek: totalWeeks,
        focus: "Incremento controllato dell'intensità e potenziamento multisport.",
        weeklyVolumeMin: 180,
        deload: false,
      },
    ];
  }

  const macroPlan: MacroPlan = {
    id: `macro_${baseline.userId}_${Date.now()}`,
    goalDescription: baseline.goals.primary.description,
    startDate,
    endDate,
    totalWeeks,
    phases,
    rationale: `Macrociclo generato deterministicamente per ${baseline.profile.experience} con ${baseline.availability.days.length} sessioni settimanali disponibili. Vincoli medici e infortuni integrati.`,
    assumptions: [`Aderenza prevista: >= 80%`, `Intensità calcolata su RPE e zone HR Garmin`],
    flags: isKneePain ? ["caution_knee_pain", "low_impact_priority"] : [],
  };

  const issues = validateMacroPlan(macroPlan);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new Error(`MacroPlan validation failed: ${errors.map((e) => e.message).join(", ")}`);
  }

  return macroPlan;
}

export function generateMicroPlan(
  baseline: Baseline,
  macroPlan: MacroPlan,
  weekIndex: number,
  options?: MicroPlanOptions,
): MicroPlan {
  if (weekIndex < 1 || weekIndex > macroPlan.totalWeeks) {
    throw new Error(`weekIndex ${weekIndex} out of bounds (1..${macroPlan.totalWeeks})`);
  }

  const phase =
    macroPlan.phases.find((p) => weekIndex >= p.startWeek && weekIndex <= p.endWeek) ??
    macroPlan.phases[0];

  const weekStartDate = options?.startDate ?? addDays(macroPlan.startDate, (weekIndex - 1) * 7);
  const weekEndDate = addDays(weekStartDate, 6);

  const deload = isDeloadWeek(weekIndex) || phase.deload;
  const isKneePain = baseline.anamnesis.injuries.some(
    (i) => i.area.includes("knee") && i.painLevel >= 4,
  );

  const availableDays = [...baseline.availability.days].sort(
    (a, b) => DAY_OFFSETS[a.day] - DAY_OFFSETS[b.day],
  );

  const sessions: PlannedSession[] = [];

  for (let idx = 0; idx < availableDays.length; idx += 1) {
    const avail = availableDays[idx];
    const sessionDate = addDays(weekStartDate, DAY_OFFSETS[avail.day]);
    const maxDur = avail.maxDurationMin;

    // Distribute sports and session types
    let sport: Sport = "running";
    let title = "Corsa Facile Z2";
    let type = "aerobic_base";
    let durationMin = Math.min(maxDur, deload ? 40 : 50);
    let rpe = deload ? 5 : 6;
    let location: "home" | "gym" | "outdoor" | "pool" | "other" = "outdoor";
    let blocks: SessionBlock[] = [];

    if (isKneePain) {
      // Prioritize low-impact sports: cycling, swimming, mobility, strength
      if (idx % 2 === 0 && baseline.profile.sports.includes("cycling")) {
        sport = "cycling";
        title = "Pedalata Continua Z2 (Scarico Ginocchio)";
        type = "low_impact_endurance";
        durationMin = Math.min(maxDur, 50);
        location = "outdoor";
        blocks = [
          {
            repeat: 1,
            steps: [
              { kind: "warmup", durationMin: 10, target: "Cadenza fluida 85-90 rpm leggera" },
              { kind: "work", durationMin: durationMin - 20, target: "Zona 2 aerobica costante" },
              { kind: "cooldown", durationMin: 10, target: "Pedalata agile defaticante" },
            ],
          },
        ];
      } else if (baseline.profile.sports.includes("swimming") && baseline.equipment.poolAccess) {
        sport = "swimming";
        title = "Nuoto Aerobico Continuo";
        type = "low_impact_cardio";
        durationMin = Math.min(maxDur, 45);
        location = "pool";
        blocks = [
          {
            repeat: 1,
            steps: [
              { kind: "warmup", durationMin: 10, target: "200m stile libero sciolto" },
              {
                kind: "work",
                durationMin: durationMin - 15,
                target: "Ripetute 100m Z2 con pull buoy",
              },
              { kind: "cooldown", durationMin: 5, target: "100m defaticamento dorso" },
            ],
          },
        ];
      } else {
        sport = "mobility";
        title = "Mobilità Catena Cinetica & Core";
        type = "rehab_mobility";
        durationMin = Math.min(maxDur, 35);
        location = "home";
        blocks = [
          {
            repeat: 1,
            steps: [
              { kind: "warmup", durationMin: 5, target: "Respirazione diaframmatica e cat-cow" },
              {
                kind: "work",
                durationMin: durationMin - 10,
                target: "Glute bridge isometrico, mobilità anche, foam roller polpacci",
              },
              { kind: "cooldown", durationMin: 5, target: "Stretching dolce bicipite femorale" },
            ],
          },
        ];
      }
    } else {
      // No acute knee pain
      const isMultisportGym =
        baseline.profile.sports.includes("strength") && baseline.equipment.gymAccess;
      const isIntermediateOrAdvanced = baseline.profile.experience !== "beginner";

      if (idx === 0) {
        // First session: Aerobic Base or Strength
        if (isMultisportGym && idx === 0) {
          sport = "strength";
          title = "Forza Funzionale & Core";
          type = "full_body_strength";
          durationMin = Math.min(maxDur, 50);
          location = "gym";
          rpe = 7;
          blocks = [
            {
              repeat: 1,
              steps: [
                {
                  kind: "warmup",
                  durationMin: 10,
                  target: "Mobilità articolare e attivazione glutei",
                },
                {
                  kind: "work",
                  durationMin: 30,
                  target: "Squat, panca/push-up, trazioni/rematore, plank",
                },
                { kind: "cooldown", durationMin: 10, target: "Defaticamento e stretching" },
              ],
            },
          ];
        } else {
          sport = "running";
          title = "Corsa Facile & Mobilità";
          type = "aerobic_base";
          durationMin = Math.min(maxDur, 45);
          blocks = [
            {
              repeat: 1,
              steps: [
                { kind: "warmup", durationMin: 5, target: "Camminata veloce e mobilità dinamica" },
                {
                  kind: "work",
                  durationMin: durationMin - 10,
                  target: "Corsa costante Z2 respirazione agevole",
                },
                { kind: "cooldown", durationMin: 5, target: "Camminata e stretching polpacci" },
              ],
            },
          ];
        }
      } else if (idx === 1 && availableDays.length >= 2) {
        // Second session: Quality or Intervals
        sport = "running";
        if (isIntermediateOrAdvanced && !deload) {
          title = "Ripetute 5×800m Soglia";
          type = "intervals";
          durationMin = Math.min(maxDur, 50);
          rpe = 8;
          blocks = [
            {
              repeat: 1,
              steps: [{ kind: "warmup", durationMin: 10, target: "Riscaldamento Z2 + allunghi" }],
            },
            {
              repeat: 5,
              steps: [
                { kind: "work", distanceM: 800, target: "Passo 4:20-4:35/km (Z4)" },
                { kind: "recovery", distanceM: 200, target: "Recupero attivo al passo" },
              ],
            },
            {
              repeat: 1,
              steps: [{ kind: "cooldown", durationMin: 8, target: "Defaticamento Z1 sciolto" }],
            },
          ];
        } else {
          title = "Corsa con Variazioni di Ritmo";
          type = "fartlek";
          durationMin = Math.min(maxDur, 40);
          rpe = 7;
          blocks = [
            {
              repeat: 1,
              steps: [
                { kind: "warmup", durationMin: 10, target: "Z1-Z2 riscaldamento progressivo" },
                {
                  kind: "work",
                  durationMin: durationMin - 15,
                  target: "5x [1 min brillante + 2 min facile]",
                },
                { kind: "cooldown", durationMin: 5, target: "Defaticamento camminata" },
              ],
            },
          ];
        }
      } else {
        // Third or subsequent session: Long Run or Cross-training
        sport = "running";
        title = deload ? "Lungo Rigenerante Z2 (Scarico)" : "Lungo Aerobico Progressivo";
        type = "long_run";
        durationMin = Math.min(maxDur, deload ? 45 : 65);
        rpe = 6;
        blocks = [
          {
            repeat: 1,
            steps: [
              { kind: "warmup", durationMin: 10, target: "Camminata + corsa lenta Z1" },
              {
                kind: "work",
                durationMin: durationMin - 18,
                target: "Corsa costante Z2 confortevole",
              },
              { kind: "cooldown", durationMin: 8, target: "Defaticamento e mobilità" },
            ],
          },
        ];
      }
    }

    const alternatives: SessionAlternative[] = [
      {
        label: "Versione 15 min (Espressa)",
        changes:
          "Riduci a 15 min di mobilità e attivazione aerobica a casa per mantenere la costanza senza affaticamento.",
      },
      {
        label: "Versione 30 min (Compressa)",
        changes: `Taglia il riscaldamento a 5 min e mantieni ${Math.min(20, durationMin - 10)} min di lavoro principale per incastrare la sessione.`,
      },
      {
        label: "Basso impatto (No-jump / Cyclette)",
        changes:
          "Sostituisci con 30-40 min di pedalata Z2 o cyclette a casa per preservare tendini e articolazioni.",
      },
    ];

    const contraindications: string[] = [];
    if (sport === "running") {
      contraindications.push("knee_impact_high", "plantar_fasciitis_acute");
    }

    const plannedSession: PlannedSession = {
      id: `session_${macroPlan.id}_w${weekIndex}_d${idx + 1}`,
      date: sessionDate,
      sport,
      type,
      title,
      durationMin,
      intensity: {
        mode: "rpe",
        rpe,
        target: rpe >= 8 ? "Z4 / Soglia" : rpe >= 6 ? "Z2 / Aerobico" : "Z1 / Rigenerante",
      },
      blocks,
      equipment:
        sport === "strength"
          ? ["dumbbells", "bodyweight"]
          : sport === "cycling"
            ? ["indoor_bike"]
            : [],
      location,
      successCriteria: `Completare la durata target mantenendo lo sforzo percepito RPE ${rpe}/10.`,
      alternatives,
      contraindications,
      status: "planned",
    };

    sessions.push(plannedSession);
  }

  const weeklyVolumeMin = sessions.reduce((sum, s) => sum + s.durationMin, 0);

  const microPlan: MicroPlan = {
    id: `micro_${macroPlan.id}_w${weekIndex}`,
    macroPlanId: macroPlan.id,
    weekIndex,
    startDate: weekStartDate,
    endDate: weekEndDate,
    focus: phase.focus,
    targetLoad: weeklyVolumeMin * (deload ? 0.7 : 1.0),
    weeklyVolumeMin,
    deload,
    sessions,
    rationale: `Settimana ${weekIndex}/${macroPlan.totalWeeks} (${phase.name})${deload ? " · Settimana di scarico/rigenerazione" : ""}. Volume totale: ${weeklyVolumeMin} minuti su ${sessions.length} sessioni.`,
    flags: deload ? ["deload_week"] : [],
  };

  const issues = validatePlanSessions(sessions, isKneePain ? ["knee_impact_high"] : []);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `MicroPlan sessions validation failed: ${errors.map((e) => e.message).join(", ")}`,
    );
  }

  return microPlan;
}
