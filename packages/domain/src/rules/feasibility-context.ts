import type { CurrentCapacity } from "../schemas/athletic";
import type { ExperienceTier, Sport } from "../schemas/common";
import type { MicroPlan } from "../schemas/plan";
import {
  type CapacityActivity,
  dayIndex,
  type FiveKReference,
  findFiveKReference,
} from "./capacity";
import { DEFAULT_TIME_ZONE, todayLocalDate } from "./dates";
import { type FiveKProjection, type FiveKProjectionInput, project5k } from "./feasibility";
import { measurePlanProgress } from "./session-adherence";

/** Finestra del volume settimanale: 4 settimane di corsa, non una costante. */
export const FEASIBILITY_VOLUME_WINDOW_DAYS = 28;

/** Oltre questo orizzonte l'estrapolazione lineare non è più credibile. */
export const FEASIBILITY_LONG_HORIZON_WEEKS = 26;

/**
 * Sedute completate necessarie prima di dare una stima. Le sedute saltate non
 * contano: non sono evidenza che il loop abbia funzionato. Sotto questa soglia
 * una confidence sarebbe un numero inventato, non una misura.
 */
export const FEASIBILITY_MIN_COMPLETED_SESSIONS = 3;

/**
 * Da dove arriva il tempo 5K usato come base della proiezione:
 * - `declared`: inserito dall'atleta (es. race prediction di Garmin Connect);
 * - `measured`: derivato dalle attività con Riegel;
 * - `reference`: ricavato al volo dalla corsa di riferimento, senza un valore
 *   già misurato nella capacità.
 */
export type FiveKTimeSource = "declared" | "measured" | "reference";

export type FiveKFeasibilityWarning =
  | "no_5k_reference"
  | "no_running_volume"
  | "no_target_date"
  | "target_date_passed"
  | "plan_not_started"
  | "insufficient_completed_sessions"
  | "long_horizon";

export interface FiveKFeasibilityInput {
  capacity: CurrentCapacity;
  tier: ExperienceTier;
  targetDate?: string | null;
  activities: readonly CapacityActivity[];
  microPlans?: readonly MicroPlan[];
  /** Inizio del piano corrente, per escludere sessioni precedenti. */
  planStartDate?: string | null;
  sport?: Sport;
  now: string;
  timezone?: string;
}

/**
 * Risultato della fattibilità 5K.
 *
 * `available: false` è uno stato di prima classe: quando manca il riferimento
 * o la data obiettivo, la UI deve dire "non disponibile" e cosa manca, non
 * mostrare una proiezione costruita su numeri inventati.
 */
export interface FiveKFeasibility {
  available: boolean;
  input: FiveKProjectionInput | null;
  projection: FiveKProjection | null;
  /** Corsa reale da cui è stato ricavato il tempo di riferimento. */
  reference: FiveKReference | null;
  /** Origine del tempo 5K su cui è costruita la proiezione. */
  current5kSource: FiveKTimeSource | null;
  weeklyVolumeKm: number | null;
  weeks: number | null;
  /**
   * Data della prima seduta completata: da qui parte il piano. `null` = il
   * piano non è ancora iniziato, quindi non esiste aderenza da misurare.
   */
  planStartedOn: string | null;
  /**
   * Sedute completate (o adattate) dalla data di inizio del piano: è il
   * campione che il loop ha davvero osservato. Sotto `sessionsRequired` non si
   * dà una stima. Le sedute saltate non contano qui: non dimostrano che il
   * piano sia partito.
   */
  sessionsCompleted: number;
  sessionsRequired: number;
  targetDate: string | null;
  volumeWindowDays: number;
  warnings: FiveKFeasibilityWarning[];
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Costruisce la proiezione 5K dai dati reali: capacità misurata sulle attività,
 * volume di corsa delle ultime 4 settimane e data obiettivo della baseline.
 * Ogni input assente diventa un warning esplicito, non un valore di default.
 *
 * Prima di dare una stima servono almeno `FEASIBILITY_MIN_COMPLETED_SESSIONS`
 * sedute completate: un piano appena applicato o rigenerato non ha storico, e
 * una confidence costruita sul nulla sarebbe inventata. Le sedute saltate non
 * aprono il cancello: da lì in poi è il loop (sedute completate + aderenza
 * misurata) a sostenere la previsione.
 */
export function estimateFiveKFeasibility(input: FiveKFeasibilityInput): FiveKFeasibility {
  const sport = input.sport ?? "running";
  const timezone = input.timezone ?? DEFAULT_TIME_ZONE;
  const nowDay = dayIndex(todayLocalDate(timezone, new Date(input.now)));
  const warnings: FiveKFeasibilityWarning[] = [];

  // Tempo di riferimento: un valore dichiarato dall'atleta (es. la stima 5K
  // mostrata da Garmin Connect) ha la precedenza, perché non è un dato che il
  // modello può ricostruire. In mancanza, vale la capacità misurata e infine la
  // corsa di riferimento, esposta per spiegare da dove arriva la stima.
  const reference = findFiveKReference(input.activities, {
    now: input.now,
    sport,
    timezone,
  });
  const declared5kSec =
    input.capacity.recent5kSource === "declared" ? input.capacity.recent5kSec : null;
  const current5kSec =
    declared5kSec ?? input.capacity.recent5kSec ?? reference?.projected5kSec ?? null;
  const current5kSource: FiveKTimeSource | null =
    current5kSec === null
      ? null
      : declared5kSec !== null
        ? "declared"
        : input.capacity.recent5kSec !== null
          ? "measured"
          : "reference";
  if (current5kSec === null) warnings.push("no_5k_reference");

  // Volume settimanale: km di corsa nella finestra diviso le settimane della
  // finestra stessa. Nessun dato di distanza = nessun volume, non zero.
  const volumeActivities = input.activities.filter((activity) => {
    if (activity.sport !== sport) return false;
    const daysAgo = nowDay - dayIndex(activity.localDate);
    return daysAgo >= 0 && daysAgo < FEASIBILITY_VOLUME_WINDOW_DAYS;
  });
  const distanceM = volumeActivities.reduce(
    (total, activity) => total + Math.max(0, activity.distanceM ?? 0),
    0,
  );
  const weeklyVolumeKm =
    distanceM > 0 ? round1(distanceM / 1000 / (FEASIBILITY_VOLUME_WINDOW_DAYS / 7)) : null;
  if (weeklyVolumeKm === null) warnings.push("no_running_volume");

  // Orizzonte: la data obiettivo della baseline, non un numero di settimane
  // scelto a priori.
  const targetDate = input.targetDate?.slice(0, 10) ?? null;
  let weeks: number | null = null;
  if (targetDate) {
    const days = dayIndex(targetDate) - nowDay;
    if (days <= 0) {
      warnings.push("target_date_passed");
    } else {
      weeks = Math.ceil(days / 7);
      if (weeks > FEASIBILITY_LONG_HORIZON_WEEKS) warnings.push("long_horizon");
    }
  } else {
    warnings.push("no_target_date");
  }

  // Il loop parte dalla prima seduta completata: prima di quella data il piano
  // non esiste ancora, quindi le sedute previste non sono ritardi né assenze.
  // Da lì contano solo le sedute del piano corrente, senza finestre di
  // calendario che possano includere giorni precedenti all'inizio.
  const progress = measurePlanProgress(input.microPlans ?? [], {
    notBefore: input.planStartDate ?? null,
  });
  const sessionsCompleted = progress.sessionsCompleted;
  if (progress.startedOn === null) {
    warnings.push("plan_not_started");
  } else if (sessionsCompleted < FEASIBILITY_MIN_COMPLETED_SESSIONS) {
    warnings.push("insufficient_completed_sessions");
  }

  const base = {
    reference,
    current5kSource,
    weeklyVolumeKm,
    weeks,
    planStartedOn: progress.startedOn,
    sessionsCompleted,
    sessionsRequired: FEASIBILITY_MIN_COMPLETED_SESSIONS,
    targetDate,
    volumeWindowDays: FEASIBILITY_VOLUME_WINDOW_DAYS,
    warnings,
  };

  if (
    current5kSec === null ||
    weeklyVolumeKm === null ||
    weeks === null ||
    progress.startedOn === null ||
    sessionsCompleted < FEASIBILITY_MIN_COMPLETED_SESSIONS
  ) {
    return { ...base, available: false, input: null, projection: null };
  }

  // Superata la soglia, l'aderenza misurata dal loop entra nella stima: non è
  // più un'ipotesi, è ciò che le sedute del piano hanno osservato.
  const projectionInput: FiveKProjectionInput = {
    current5kSec,
    weeks,
    tier: input.tier,
    weeklyVolumeKm,
    adherence: (progress.adherencePct ?? 0) / 100,
  };

  try {
    return {
      ...base,
      available: true,
      input: projectionInput,
      projection: project5k(projectionInput),
    };
  } catch {
    // Guardie già applicate sopra: se il modello rifiuta l'input, lo trattiamo
    // come dato non utilizzabile invece di propagare un 500.
    return { ...base, available: false, input: null, projection: null };
  }
}
