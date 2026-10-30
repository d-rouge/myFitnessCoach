import type { Injury } from "../schemas/anamnesis";
import type { AthleteBackground, AthleticHistory, CurrentCapacity } from "../schemas/athletic";
import type { Baseline } from "../schemas/baseline";
import type { Checkin } from "../schemas/checkin";
import type { Equipment } from "../schemas/equipment";
import type { Goal } from "../schemas/goal";
import type { MacroPlan, MicroPlan } from "../schemas/plan";
import type { Preferences } from "../schemas/preferences";
import { dayIndex } from "./capacity";
import { todayLocalDate } from "./dates";
import { buildRecentContext, type ContextActivity, type RecentContext } from "./recent-context";
import { ADHERENCE_WINDOW_DAYS, measureAdherence } from "./session-adherence";
import { buildTrainingHistory, type TrainingHistory } from "./training-history";

/**
 * Dossier atleta: l'unico oggetto di contesto.
 *
 * Nasce da un problema concreto: metà del profilo veniva raccolta e mai usata.
 * Il dossier rende esplicito cosa il sistema sa, cosa manca e da dove viene
 * ogni blocco, così sia il generatore deterministico sia il Proposer LLM
 * leggono la stessa cosa invece di due percorsi diversi.
 *
 * È una proiezione **pura e deterministica**: stesso input, stesso dossier.
 * Non contiene prosa e non contiene giudizi: i giudizi sono del layer che
 * pianifica.
 */
export const ATHLETE_DOSSIER_VERSION = 3;

/** Finestra di osservazione per aderenza, RPE e dolore. */
export const DOSSIER_RESPONSE_WINDOW_DAYS = ADHERENCE_WINDOW_DAYS;
/** Settimane di storico piano incluse nel dossier. */
export const DOSSIER_PLAN_HISTORY_WEEKS = 6;

export interface DossierIdentity {
  ageYears: number | null;
  sex: Baseline["profile"]["sex"];
  heightCm: number;
  weightKg: number;
  timezone: string;
  units: Baseline["profile"]["units"];
  tone: Baseline["profile"]["tone"];
}

export interface DossierIndividualResponse {
  windowDays: number;
  sessionsPlanned: number;
  /** Sedute concluse, anche in forma adattata. */
  sessionsCompleted: number;
  /** Sedute con esito esplicito: concluse oppure saltate. */
  sessionsDecided: number;
  /** Sedute passate non marcate: l'app non sa se siano state fatte. */
  sessionsUnknown: number;
  /**
   * Percentuale di sedute concluse sulle sole sedute con esito esplicito.
   * `null` quando nessuna seduta ha un esito: non è 0%, è "non misurabile".
   */
  adherencePct: number | null;
  rpeSamples: number;
  /**
   * Media di (RPE riportato − RPE prescritto) sulle sedute con check-in
   * post-seduta. Positivo = la seduta è costata più del previsto.
   */
  rpeDrift: number | null;
  painEvents: number;
  recurringPainAreas: string[];
}

export interface DossierPlanMemory {
  method: string | null;
  macroStartDate: string | null;
  totalWeeks: number | null;
  weekIndex: number | null;
  phaseName: string | null;
  recoveryWindow: { weeks: number; untilDate: string | null } | null;
}

export interface DossierPlanHistoryEntry {
  weekStart: string;
  weekIndex: number;
  focus: string;
  planned: number;
  completed: number;
  plannedMin: number;
}

export interface DossierConstraints {
  availability: Baseline["availability"]["days"];
  equipment: Equipment;
  injuries: Injury[];
  conditions: string[];
  medications: string[];
  redFlags: string[];
  parqCleared: boolean;
}

export interface AthleteDossier {
  version: number;
  asOf: string;
  identity: DossierIdentity;
  goals: { primary: Goal; secondary: Goal[] };
  athleteBackground: AthleteBackground | null;
  sportSpecificHistory: AthleticHistory;
  capacity: CurrentCapacity;
  recentContext: RecentContext;
  /** Ultime due settimane con tipo di seduta: base per scegliere la metodologia. */
  trainingHistory: TrainingHistory;
  individualResponse: DossierIndividualResponse;
  planMemory: DossierPlanMemory;
  planHistory: DossierPlanHistoryEntry[];
  constraints: DossierConstraints;
  preferences: Preferences;
  /** Cosa manca per poter pianificare bene. Vuoto = contesto completo. */
  warnings: string[];
  coverage: {
    activities: number;
    checkins: number;
    microPlans: number;
    sessionsInWindow: number;
  };
}

export interface DossierInput {
  /** Baseline già normalizzata (e con capacità misurata, se la fonte lo prevede). */
  baseline: Baseline;
  activities?: readonly ContextActivity[];
  checkins?: readonly Checkin[];
  macroPlan?: MacroPlan | null;
  microPlans?: readonly MicroPlan[];
  now: string;
}

/**
 * Campi della baseline consumati dal dossier. Serve al test di copertura: se
 * qualcuno aggiunge un campo al profilo e non lo passa di qui, il test fallisce
 * invece di lasciarlo dimenticato per mesi.
 */
export const DOSSIER_BASELINE_SOURCES = [
  "profile",
  "anamnesis",
  "goals",
  "availability",
  "equipment",
  "preferences",
] as const;

export const DOSSIER_PROFILE_SOURCES = [
  "birthDate",
  "sex",
  "heightCm",
  "weightKg",
  "athleteBackground",
  "timezone",
  "units",
  "tone",
  "history",
  "capacity",
  "sports",
  "experienceTier",
] as const;

/** Solo per documentazione: campi raccolti ma non ancora usati da nessuno. */
export const DOSSIER_UNUSED_YET = ["summary"] as const;

function ageAt(birthDate: string, asOf: string): number | null {
  const born = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : null;
  if (!born) return null;

  const [by, bm, bd] = born.split("-").map(Number) as [number, number, number];
  const [ay, am, ad] = asOf.slice(0, 10).split("-").map(Number) as [number, number, number];

  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Compila il dossier. Funzione pura: nessun I/O, nessun `new Date()` implicito.
 */
export function buildAthleteDossier(input: DossierInput): AthleteDossier {
  const { baseline, now } = input;
  const activities = input.activities ?? [];
  const checkins = input.checkins ?? [];
  const microPlans = input.microPlans ?? [];
  const timezone = baseline.profile.timezone;

  const recentContext = buildRecentContext(activities, {
    now,
    timezone,
    fallbackLastActivityDate: baseline.profile.capacity.lastActivityDate,
  });
  const trainingHistory = buildTrainingHistory(activities, { now, timezone });
  // Stessa definizione di "oggi" usata da buildRecentContext: giorno locale.
  const nowDay = dayIndex(todayLocalDate(timezone, new Date(now)));
  const windowStartDay = nowDay - DOSSIER_RESPONSE_WINDOW_DAYS;

  // --- Sedute della finestra -------------------------------------------------
  const adherence = measureAdherence(microPlans, { now, timezone });
  const sessionsInWindow = adherence.sessions;
  const completedInWindow = sessionsInWindow.filter(
    ({ session }) => session.status === "completed",
  );

  const adherencePct = adherence.adherencePct;

  // --- Risposta individuale --------------------------------------------------
  const postSessionRpe = new Map<string, number>();
  for (const checkin of checkins) {
    if (checkin.type === "post_session" && checkin.rpe !== undefined) {
      postSessionRpe.set(checkin.date.slice(0, 10), checkin.rpe);
    }
  }

  const drifts: number[] = [];
  for (const { session } of completedInWindow) {
    const reported = postSessionRpe.get(session.date.slice(0, 10));
    const prescribed = session.intensity.rpe;
    if (reported !== undefined && prescribed !== undefined) {
      drifts.push(reported - prescribed);
    }
  }

  const windowCheckins = checkins.filter((checkin) => {
    const day = dayIndex(checkin.date);
    return day <= nowDay && day > windowStartDay;
  });

  const painByArea = new Map<string, number>();
  let painEvents = 0;
  for (const checkin of windowCheckins) {
    for (const pain of checkin.pain ?? []) {
      painEvents += 1;
      painByArea.set(pain.area, (painByArea.get(pain.area) ?? 0) + 1);
    }
  }

  // --- Memoria del piano -----------------------------------------------------
  const macroPlan = input.macroPlan ?? null;
  const currentMicro = [...microPlans].sort((a, b) => b.weekIndex - a.weekIndex)[0] ?? null;
  const currentPhase =
    macroPlan && currentMicro
      ? (macroPlan.phases.find(
          (phase) =>
            currentMicro.weekIndex >= phase.startWeek && currentMicro.weekIndex <= phase.endWeek,
        ) ?? null)
      : null;

  const planHistory: DossierPlanHistoryEntry[] = [...microPlans]
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
    .slice(0, DOSSIER_PLAN_HISTORY_WEEKS)
    .map((plan) => ({
      weekStart: plan.startDate,
      weekIndex: plan.weekIndex,
      focus: plan.focus,
      planned: plan.sessions.length,
      completed: plan.sessions.filter((s) => s.status === "completed").length,
      plannedMin: plan.sessions.reduce((sum, s) => sum + s.durationMin, 0),
    }));

  // --- Avvisi ----------------------------------------------------------------
  const warnings: string[] = [];
  if (activities.length === 0) warnings.push("no_activities");
  if (checkins.length === 0) warnings.push("no_checkins");
  if (microPlans.length === 0) warnings.push("no_plan_history");
  if (adherencePct === null) warnings.push("no_adherence");
  if (drifts.length === 0) warnings.push("no_rpe_feedback");
  if (baseline.profile.athleteBackground === null) warnings.push("no_athletic_background");

  return {
    version: ATHLETE_DOSSIER_VERSION,
    asOf: now,
    identity: {
      ageYears: ageAt(baseline.profile.birthDate, recentContext.asOf),
      sex: baseline.profile.sex,
      heightCm: baseline.profile.heightCm,
      weightKg: baseline.profile.weightKg,
      timezone,
      units: baseline.profile.units,
      tone: baseline.profile.tone,
    },
    goals: {
      primary: baseline.goals.primary,
      secondary: baseline.goals.secondary ?? [],
    },
    athleteBackground: baseline.profile.athleteBackground,
    sportSpecificHistory: baseline.profile.history,
    capacity: baseline.profile.capacity,
    recentContext,
    trainingHistory,
    individualResponse: {
      windowDays: DOSSIER_RESPONSE_WINDOW_DAYS,
      sessionsPlanned: sessionsInWindow.length,
      sessionsCompleted: adherence.sessionsCompleted,
      sessionsDecided: adherence.sessionsDecided,
      sessionsUnknown: adherence.sessionsUnknown,
      adherencePct,
      rpeSamples: drifts.length,
      rpeDrift: drifts.length > 0 ? round(drifts.reduce((a, b) => a + b, 0) / drifts.length) : null,
      painEvents,
      recurringPainAreas: [...painByArea.entries()]
        .filter(([, count]) => count >= 2)
        .map(([area]) => area)
        .sort(),
    },
    planMemory: {
      method: null,
      macroStartDate: macroPlan?.startDate ?? null,
      totalWeeks: macroPlan?.totalWeeks ?? null,
      weekIndex: currentMicro?.weekIndex ?? null,
      phaseName: currentPhase?.name ?? null,
      recoveryWindow: macroPlan?.recoveryWindow
        ? {
            weeks: macroPlan.recoveryWindow.weeks,
            untilDate: macroPlan.recoveryWindow.untilDate ?? null,
          }
        : null,
    },
    planHistory,
    constraints: {
      availability: baseline.availability.days,
      equipment: baseline.equipment,
      injuries: baseline.anamnesis.injuries,
      conditions: baseline.anamnesis.conditions,
      medications: baseline.anamnesis.medications,
      redFlags: baseline.anamnesis.redFlags,
      parqCleared: baseline.anamnesis.parqCleared,
    },
    preferences: baseline.preferences,
    warnings,
    coverage: {
      activities: activities.length,
      checkins: checkins.length,
      microPlans: microPlans.length,
      sessionsInWindow: sessionsInWindow.length,
    },
  };
}
