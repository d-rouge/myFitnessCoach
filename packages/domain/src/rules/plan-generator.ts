import type { Baseline } from "../schemas/baseline";
import type { Sport, Weekday } from "../schemas/common";
import type { MacroPlan, MicroPlan, PlanPhase } from "../schemas/plan";
import type { PlannedSession, SessionAlternative, SessionBlock } from "../schemas/session";
import { todayLocalDate } from "./dates";
import { isDeloadWeek } from "./progression";
import { validateMacroPlan, validatePlanSessions } from "./validator";

export interface MacroPlanOptions {
  startDate?: string;
  totalWeeks?: number;
}

export interface MicroPlanOptions {
  startDate?: string;
}

const DAY_JS_INDEX: Record<Weekday, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 0,
};

const ENDURANCE_SPORTS: Sport[] = ["running", "cycling", "swimming"];

const SPORT_LABELS: Record<Sport, string> = {
  running: "corsa",
  cycling: "bici",
  swimming: "nuoto",
  strength: "forza",
  mobility: "mobilità",
  other: "attività",
};

interface SessionDraft {
  sport: Sport;
  title: string;
  type: string;
  durationMin: number;
  rpe: number;
  location: PlannedSession["location"];
  blocks: SessionBlock[];
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Days from `startDate` to the next occurrence of `day` (0..6). */
function offsetForWeekday(startDate: string, day: Weekday): number {
  const startDow = new Date(`${startDate}T00:00:00Z`).getUTCDay();
  return (DAY_JS_INDEX[day] - startDow + 7) % 7;
}

function isKneePain(baseline: Baseline): boolean {
  return baseline.anamnesis.injuries.some(
    (injury) => injury.area.includes("knee") && injury.painLevel >= 4,
  );
}

function canUseSport(baseline: Baseline, sport: Sport): boolean {
  if (!baseline.profile.sports.includes(sport)) return false;
  if (sport === "swimming" && !baseline.equipment.poolAccess) return false;
  return true;
}

/** Derives a target pace (m:ss/km) from the primary goal, when the data allows it. */
export function goalPaceText(baseline: Baseline): string | null {
  const goal = baseline.goals.primary;
  if (goal.type !== "race" && goal.type !== "performance") return null;
  if (goal.targetValue === undefined || !goal.targetUnit) return null;

  const text = `${goal.metric ?? ""} ${goal.description}`.toLowerCase();
  const distances: Array<{ pattern: RegExp; km: number }> = [
    { pattern: /5\s?k|5000|cinque/, km: 5 },
    { pattern: /10\s?k|10000|dieci/, km: 10 },
    { pattern: /21[.,]1|mezza|half/, km: 21.1 },
    { pattern: /42[.,]2|maratona|marathon/, km: 42.195 },
  ];
  const distanceKm = distances.find((entry) => entry.pattern.test(text))?.km;

  const unit = goal.targetUnit.toLowerCase().replace(/\s/g, "");
  let seconds: number;
  if (unit.startsWith("sec") || unit === "s" || unit === "s/km") {
    seconds = goal.targetValue;
  } else if (unit.startsWith("min") || unit === "m" || unit === "min/km") {
    seconds = goal.targetValue * 60;
  } else if (unit.startsWith("h")) {
    seconds = goal.targetValue * 3600;
  } else {
    return null;
  }

  // A pace unit already expresses seconds per kilometre; a race time must be
  // divided by the goal distance.
  const perKm = unit.includes("/km") ? seconds : distanceKm ? seconds / distanceKm : Number.NaN;
  if (!Number.isFinite(perKm) || perKm < 120 || perKm > 1200) return null;

  const minutes = Math.floor(perKm / 60);
  const remaining = Math.round(perKm % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

/** Scales step durations proportionally until the blocks fit the session. */
function fitBlocksToDuration(blocks: SessionBlock[], durationMin: number): SessionBlock[] {
  const planned = blocks.reduce(
    (total, block) =>
      total + block.repeat * block.steps.reduce((sum, step) => sum + (step.durationMin ?? 0), 0),
    0,
  );
  if (planned <= durationMin) return blocks;

  const factor = durationMin / planned;
  return blocks.map((block) => ({
    ...block,
    steps: block.steps.map((step) =>
      step.durationMin
        ? { ...step, durationMin: Math.max(1, Math.floor(step.durationMin * factor)) }
        : step,
    ),
  }));
}

function steadyBlocks(
  durationMin: number,
  warmupMin: number,
  cooldownMin: number,
  workTarget: string,
  warmupTarget = "Riscaldamento progressivo Z1-Z2",
  cooldownTarget = "Defaticamento e mobilità",
): SessionBlock[] {
  const workMin = Math.max(1, durationMin - warmupMin - cooldownMin);
  return [
    {
      repeat: 1,
      steps: [
        { kind: "warmup", durationMin: warmupMin, target: warmupTarget },
        { kind: "work", durationMin: workMin, target: workTarget },
        { kind: "cooldown", durationMin: cooldownMin, target: cooldownTarget },
      ],
    },
  ];
}

function buildRunningSession(
  baseline: Baseline,
  index: number,
  maxDurationMin: number,
  deload: boolean,
): SessionDraft {
  const intermediate = baseline.profile.experience !== "beginner";
  const pace = goalPaceText(baseline);
  const thresholdTarget = pace
    ? `Passo ${pace}/km (Z4 / Soglia)`
    : "Soglia RPE 8, passo controllato";

  if (index === 0) {
    const durationMin = Math.min(maxDurationMin, deload ? 35 : 45);
    return {
      sport: "running",
      title: "Corsa Facile & Mobilità",
      type: "aerobic_base",
      durationMin,
      rpe: deload ? 4 : 5,
      location: "outdoor",
      blocks: steadyBlocks(
        durationMin,
        5,
        5,
        "Corsa costante Z2, respirazione agevole",
        "Camminata veloce e mobilità dinamica",
        "Camminata e stretching polpacci",
      ),
    };
  }

  if (index === 1) {
    if (intermediate && !deload) {
      const durationMin = Math.min(maxDurationMin, 50);
      return {
        sport: "running",
        title: "Ripetute 5×800m Soglia",
        type: "intervals",
        durationMin,
        rpe: 8,
        location: "outdoor",
        blocks: [
          {
            repeat: 1,
            steps: [{ kind: "warmup", durationMin: 10, target: "Riscaldamento Z2 + allunghi" }],
          },
          {
            repeat: 5,
            steps: [
              { kind: "work", distanceM: 800, target: thresholdTarget },
              { kind: "recovery", distanceM: 200, target: "Recupero attivo al passo" },
            ],
          },
          {
            repeat: 1,
            steps: [{ kind: "cooldown", durationMin: 8, target: "Defaticamento Z1 sciolto" }],
          },
        ],
      };
    }

    const durationMin = Math.min(maxDurationMin, 40);
    return {
      sport: "running",
      title: "Corsa con Variazioni di Ritmo",
      type: "fartlek",
      durationMin,
      rpe: 7,
      location: "outdoor",
      blocks: steadyBlocks(
        durationMin,
        10,
        5,
        "5x [1 min brillante + 2 min facile]",
        "Z1-Z2 riscaldamento progressivo",
        "Defaticamento camminata",
      ),
    };
  }

  const durationMin = Math.min(maxDurationMin, deload ? 45 : 65);
  return {
    sport: "running",
    title: deload ? "Lungo Rigenerante Z2 (Scarico)" : "Lungo Aerobico Progressivo",
    type: "long_run",
    durationMin,
    rpe: 6,
    location: "outdoor",
    blocks: steadyBlocks(
      durationMin,
      10,
      8,
      "Corsa costante Z2 confortevole",
      "Camminata + corsa lenta Z1",
      "Defaticamento e mobilità",
    ),
  };
}

function buildCyclingSession(
  baseline: Baseline,
  index: number,
  maxDurationMin: number,
  deload: boolean,
): SessionDraft {
  const intermediate = baseline.profile.experience !== "beginner";

  if (index === 0) {
    const durationMin = Math.min(maxDurationMin, deload ? 35 : 50);
    return {
      sport: "cycling",
      title: "Pedalata Continua Z2",
      type: "aerobic_base",
      durationMin,
      rpe: deload ? 4 : 5,
      location: "outdoor",
      blocks: steadyBlocks(
        durationMin,
        10,
        10,
        "Zona 2 aerobica, cadenza 85-95 rpm",
        "Pedalata leggera e mobilità anche",
        "Pedalata agile defaticante",
      ),
    };
  }

  if (index === 1 && intermediate && !deload) {
    const durationMin = Math.min(maxDurationMin, 50);
    return {
      sport: "cycling",
      title: "Intervalli in Salita Z4",
      type: "intervals",
      durationMin,
      rpe: 8,
      location: "outdoor",
      blocks: [
        {
          repeat: 1,
          steps: [{ kind: "warmup", durationMin: 10, target: "Pedalata Z2 + 3 sprint brevi" }],
        },
        {
          repeat: 4,
          steps: [
            { kind: "work", durationMin: 4, target: "Z4 / Soglia (RPE 8), cadenza 70-80 rpm" },
            { kind: "recovery", durationMin: 3, target: "Z2 agile" },
          ],
        },
        {
          repeat: 1,
          steps: [{ kind: "cooldown", durationMin: 8, target: "Defaticamento Z1" }],
        },
      ],
    };
  }

  const durationMin = Math.min(maxDurationMin, deload ? 45 : 70);
  return {
    sport: "cycling",
    title: deload ? "Lungo in Bici Rigenerante" : "Lungo in Bici Z2",
    type: "long_ride",
    durationMin,
    rpe: 6,
    location: "outdoor",
    blocks: steadyBlocks(
      durationMin,
      10,
      8,
      "Zona 2 costante, cadenza 85-95 rpm",
      "Pedalata progressiva Z1-Z2",
      "Defaticamento agile",
    ),
  };
}

function buildSwimmingSession(
  baseline: Baseline,
  index: number,
  maxDurationMin: number,
  deload: boolean,
): SessionDraft {
  const intermediate = baseline.profile.experience !== "beginner";

  if (index === 0) {
    const durationMin = Math.min(maxDurationMin, deload ? 35 : 45);
    return {
      sport: "swimming",
      title: "Nuoto Aerobico Continuo",
      type: "aerobic_base",
      durationMin,
      rpe: deload ? 4 : 5,
      location: "pool",
      blocks: steadyBlocks(
        durationMin,
        10,
        5,
        "Ripetute 100m Z2 con pull buoy",
        "200m stile libero sciolto",
        "100m defaticamento dorso",
      ),
    };
  }

  if (index === 1 && intermediate && !deload) {
    const durationMin = Math.min(maxDurationMin, 50);
    return {
      sport: "swimming",
      title: "Ripetute 100m Soglia",
      type: "intervals",
      durationMin,
      rpe: 8,
      location: "pool",
      blocks: [
        {
          repeat: 1,
          steps: [{ kind: "warmup", durationMin: 10, target: "300m misto sciolto" }],
        },
        {
          repeat: 8,
          steps: [
            { kind: "work", distanceM: 100, target: "Ritmo soglia (RPE 8)" },
            { kind: "recovery", distanceM: 50, target: "Recupero facile" },
          ],
        },
        {
          repeat: 1,
          steps: [{ kind: "cooldown", durationMin: 5, target: "100m defaticamento" }],
        },
      ],
    };
  }

  const durationMin = Math.min(maxDurationMin, deload ? 40 : 55);
  return {
    sport: "swimming",
    title: deload ? "Lungo in Acqua Rigenerante" : "Lungo in Acqua Z2",
    type: "long_swim",
    durationMin,
    rpe: 6,
    location: "pool",
    blocks: steadyBlocks(
      durationMin,
      10,
      5,
      "Nuoto continuo Z2, respirazione regolare",
      "200m stile libero progressivo",
      "100m defaticamento",
    ),
  };
}

function buildStrengthSession(
  index: number,
  maxDurationMin: number,
  deload: boolean,
): SessionDraft {
  const durationMin = Math.min(maxDurationMin, deload ? 35 : 50);
  const warmupMin = Math.max(5, Math.round(durationMin * 0.2));
  const cooldownMin = Math.max(5, Math.round(durationMin * 0.2));
  const workMin = Math.max(5, durationMin - warmupMin - cooldownMin);
  const variant = index % 2 === 0 ? "A" : "B";

  return {
    sport: "strength",
    title: `Forza Funzionale ${variant}`,
    type: "full_body_strength",
    durationMin,
    rpe: deload ? 5 : 7,
    location: "gym",
    blocks: [
      {
        repeat: 1,
        steps: [
          {
            kind: "warmup",
            durationMin: warmupMin,
            target: "Mobilità articolare e attivazione glutei",
          },
          {
            kind: "work",
            durationMin: workMin,
            target:
              variant === "A"
                ? "Squat, panca/push-up, trazioni/rematore, plank"
                : "Stacco rumeno, lento avanti, affondi, plank laterale",
          },
          { kind: "cooldown", durationMin: cooldownMin, target: "Defaticamento e stretching" },
        ],
      },
    ],
  };
}

function buildMobilitySession(maxDurationMin: number, deload: boolean): SessionDraft {
  const durationMin = Math.min(maxDurationMin, deload ? 30 : 35);
  return {
    sport: "mobility",
    title: "Mobilità Catena Cinetica & Core",
    type: "rehab_mobility",
    durationMin,
    rpe: 3,
    location: "home",
    blocks: steadyBlocks(
      durationMin,
      5,
      5,
      "Glute bridge isometrico, mobilità anche, foam roller polpacci",
      "Respirazione diaframmatica e cat-cow",
      "Stretching dolce bicipite femorale",
    ),
  };
}

function chooseSport(baseline: Baseline, index: number, kneePain: boolean): Sport {
  if (kneePain) {
    if (index % 2 === 0 && canUseSport(baseline, "cycling")) return "cycling";
    if (canUseSport(baseline, "swimming")) return "swimming";
    return "mobility";
  }

  const goalSport = baseline.goals.primary.sport;
  const endurance = baseline.profile.sports.filter(
    (sport) => ENDURANCE_SPORTS.includes(sport) && canUseSport(baseline, sport),
  );
  const strength = canUseSport(baseline, "strength");
  const mobility = canUseSport(baseline, "mobility");

  if (goalSport === "strength" && strength) {
    if (index === 0) return "strength";
    return endurance[(index - 1) % endurance.length] ?? "strength";
  }

  if (goalSport && ENDURANCE_SPORTS.includes(goalSport) && canUseSport(baseline, goalSport)) {
    return goalSport;
  }

  const rotation: Sport[] = [...endurance];
  if (strength) rotation.push("strength");
  if (mobility) rotation.push("mobility");
  if (rotation.length === 0) rotation.push("mobility");

  return rotation[index % rotation.length] ?? "mobility";
}

function buildDraft(
  baseline: Baseline,
  index: number,
  maxDurationMin: number,
  deload: boolean,
): SessionDraft {
  const kneePain = isKneePain(baseline);
  const sport = chooseSport(baseline, index, kneePain);

  switch (sport) {
    case "running":
      return buildRunningSession(baseline, index, maxDurationMin, deload);
    case "cycling":
      return buildCyclingSession(baseline, index, maxDurationMin, deload);
    case "swimming":
      return buildSwimmingSession(baseline, index, maxDurationMin, deload);
    case "strength":
      return buildStrengthSession(index, maxDurationMin, deload);
    default:
      return buildMobilitySession(maxDurationMin, deload);
  }
}

export function generateMacroPlan(baseline: Baseline, options?: MacroPlanOptions): MacroPlan {
  const startDate = options?.startDate ?? todayLocalDate(baseline.profile.timezone);
  const totalWeeks = options?.totalWeeks ?? (baseline.goals.primary.type === "race" ? 12 : 8);
  const endDate = addDays(startDate, totalWeeks * 7 - 1);

  const goalType = baseline.goals.primary.type;
  const kneePain = isKneePain(baseline);
  const sportLabel =
    SPORT_LABELS[baseline.goals.primary.sport ?? baseline.profile.sports[0] ?? "running"];

  let phases: PlanPhase[];

  if (kneePain) {
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
        focus: `Volume a bassa intensità (Z2), tecnica di ${sportLabel} e mobilità fondamentale.`,
        weeklyVolumeMin: 160,
        deload: false,
      },
      {
        name: "Sviluppo Soglia e Ritmo Gara",
        startWeek: baseEnd + 1,
        endWeek: buildEnd,
        focus: `Intervalli guidati, lavori a soglia e tenuta al ritmo obiettivo di ${sportLabel}.`,
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
    rationale: `Macrociclo generato deterministicamente per ${baseline.profile.experience} con ${baseline.availability.days.length} sessioni settimanali disponibili. Obiettivo primario: ${baseline.goals.primary.description}. Vincoli medici e infortuni integrati.`,
    assumptions: [`Aderenza prevista: >= 80%`, `Intensità calcolata su RPE e zone HR Garmin`],
    flags: kneePain ? ["caution_knee_pain", "low_impact_priority"] : [],
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
  const kneePain = isKneePain(baseline);

  const availableDays = [...baseline.availability.days]
    .map((day) => ({ ...day, offset: offsetForWeekday(weekStartDate, day.day) }))
    .sort((a, b) => a.offset - b.offset || DAY_JS_INDEX[a.day] - DAY_JS_INDEX[b.day]);

  const sessions: PlannedSession[] = [];

  for (let idx = 0; idx < availableDays.length; idx += 1) {
    const avail = availableDays[idx];
    if (!avail) continue;

    const sessionDate = addDays(weekStartDate, avail.offset);
    const draft = buildDraft(baseline, idx, avail.maxDurationMin, deload);
    const blocks = fitBlocksToDuration(draft.blocks, draft.durationMin);

    const alternatives: SessionAlternative[] = [
      {
        label: "Versione 15 min (Espressa)",
        changes:
          "Riduci a 15 min di mobilità e attivazione aerobica a casa per mantenere la costanza senza affaticamento.",
      },
      {
        label: "Versione 30 min (Compressa)",
        changes: `Taglia il riscaldamento a 5 min e mantieni ${Math.min(20, draft.durationMin - 10)} min di lavoro principale per incastrare la sessione.`,
      },
      {
        label: "Basso impatto (No-jump / Cyclette)",
        changes:
          "Sostituisci con 30-40 min di pedalata Z2 o cyclette a casa per preservare tendini e articolazioni.",
      },
    ];

    const contraindications: string[] = [];
    if (draft.sport === "running") {
      contraindications.push("knee_impact_high", "plantar_fasciitis_acute");
    }

    const equipment =
      draft.sport === "strength"
        ? baseline.equipment.gymAccess
          ? ["dumbbells", "bodyweight"]
          : ["bodyweight"]
        : draft.sport === "cycling" && baseline.equipment.items.includes("indoor_bike")
          ? ["indoor_bike"]
          : draft.sport === "swimming"
            ? ["pool"]
            : [];

    const plannedSession: PlannedSession = {
      id: `session_${macroPlan.id}_w${weekIndex}_d${idx + 1}`,
      date: sessionDate,
      sport: draft.sport,
      type: draft.type,
      title: draft.title,
      durationMin: draft.durationMin,
      intensity: {
        mode: "rpe",
        rpe: draft.rpe,
        target:
          draft.rpe >= 8 ? "Z4 / Soglia" : draft.rpe >= 6 ? "Z2 / Aerobico" : "Z1 / Rigenerante",
      },
      blocks,
      equipment,
      location: draft.location,
      successCriteria: `Completare la durata target mantenendo lo sforzo percepito RPE ${draft.rpe}/10.`,
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

  const issues = validatePlanSessions(sessions, kneePain ? ["knee_impact_high"] : []);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `MicroPlan sessions validation failed: ${errors.map((e) => e.message).join(", ")}`,
    );
  }

  return microPlan;
}
