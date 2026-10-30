import type { MicroPlan } from "../schemas/plan";
import type { PlannedSession } from "../schemas/session";
import { dayIndex } from "./capacity";
import { DEFAULT_TIME_ZONE, todayLocalDate } from "./dates";

/**
 * Finestra di osservazione dell'aderenza. La stessa ovunque: dossier atleta e
 * fattibilità 5K devono leggere lo stesso numero, altrimenti la proiezione e
 * il contesto raccontano due storie diverse.
 */
export const ADHERENCE_WINDOW_DAYS = 28;

export interface AdherenceSession {
  plan: MicroPlan;
  session: PlannedSession;
}

export interface AdherenceMeasurement {
  windowDays: number;
  /** Sedute della finestra con data fino a oggi (incluse quelle non marcate). */
  sessionsPlanned: number;
  /** Sedute concluse, anche in forma adattata (`completed` o `adjusted`). */
  sessionsCompleted: number;
  /** Sedute con un esito esplicito: concluse oppure saltate. */
  sessionsDecided: number;
  /**
   * Sedute passate ancora in stato `planned`. Non sappiamo se siano state
   * fatte: l'app non ha un check-in. Contarle come fallite trasformerebbe
   * "non marcato" in "non fatto", che è un'inferenza, non un dato.
   */
  sessionsUnknown: number;
  /**
   * Percentuale di sedute concluse sulle sole sedute con esito esplicito.
   * `null` quando nessuna seduta ha un esito: non è 0%, è "non misurabile".
   */
  adherencePct: number | null;
  /** Sedute della finestra, utili a chi deve incrociarle con check-in e RPE. */
  sessions: AdherenceSession[];
}

/** Una seduta è "fatta" anche quando è stata adattata, non solo completata. */
function isCompleted(session: PlannedSession): boolean {
  return session.status === "completed" || session.status === "adjusted";
}

/**
 * Aderenza misurata sui piani recenti, non dichiarata dall'atleta.
 *
 * Il denominatore sono le sedute con un esito esplicito. Una seduta passata
 * rimasta `planned` non entra né al numeratore né al denominatore: viene
 * esposta in `sessionsUnknown` e la UI la mostra come "non registrata".
 */
export function measureAdherence(
  microPlans: readonly MicroPlan[],
  options: { now: string; timezone?: string },
): AdherenceMeasurement {
  const timezone = options.timezone ?? DEFAULT_TIME_ZONE;
  const nowDay = dayIndex(todayLocalDate(timezone, new Date(options.now)));
  const windowStartDay = nowDay - ADHERENCE_WINDOW_DAYS;

  const sessions = microPlans.flatMap((plan) =>
    plan.sessions.map((session) => ({ plan, session })),
  );
  const inWindow = sessions.filter(({ session }) => {
    const day = dayIndex(session.date);
    return day <= nowDay && day > windowStartDay;
  });
  const completed = inWindow.filter(({ session }) => isCompleted(session)).length;
  const decided = inWindow.filter(({ session }) => session.status !== "planned").length;
  const unknown = inWindow.length - decided;

  return {
    windowDays: ADHERENCE_WINDOW_DAYS,
    sessionsPlanned: inWindow.length,
    sessionsCompleted: completed,
    sessionsDecided: decided,
    sessionsUnknown: unknown,
    adherencePct: decided > 0 ? Math.round((completed / decided) * 100) : null,
    sessions: inWindow,
  };
}

/**
 * Avanzamento del piano corrente, relativo al piano stesso.
 *
 * Il piano parte dalla prima seduta completata: prima di quella data non
 * esiste storico, quindi le sedute "previste" non sono ritardi né assenze.
 * Da lì in poi si contano solo le sedute del piano, senza una finestra di
 * calendario che possa includere giorni precedenti all'inizio.
 */
export interface PlanProgress {
  /** Data della prima seduta completata (o adattata). `null` = piano non iniziato. */
  startedOn: string | null;
  /** Sedute del piano dalla data di inizio, incluse quelle future. */
  sessionsPlanned: number;
  /** Sedute completate o adattate dalla data di inizio. */
  sessionsCompleted: number;
  /** Sedute con esito esplicito dalla data di inizio (completate o saltate). */
  sessionsDecided: number;
  /** Completate sulle sedute con esito: `null` se il piano non è ancora iniziato. */
  adherencePct: number | null;
}

export function measurePlanProgress(
  microPlans: readonly MicroPlan[],
  options: { notBefore?: string | null } = {},
): PlanProgress {
  const notBefore = options.notBefore?.slice(0, 10) ?? null;
  const sessions = microPlans
    .flatMap((plan) => plan.sessions)
    .filter((session) => notBefore === null || session.date.slice(0, 10) >= notBefore);

  // La prima seduta completata è l'inizio effettivo del piano: non la data in
  // cui è stato generato, non il lunedì della settimana, non "oggi".
  const startedOn =
    sessions
      .filter((session) => isCompleted(session))
      .map((session) => session.date.slice(0, 10))
      .sort()[0] ?? null;

  if (startedOn === null) {
    return {
      startedOn: null,
      sessionsPlanned: 0,
      sessionsCompleted: 0,
      sessionsDecided: 0,
      adherencePct: null,
    };
  }

  const inPlan = sessions.filter((session) => session.date.slice(0, 10) >= startedOn);
  const completed = inPlan.filter((session) => isCompleted(session)).length;
  const decided = inPlan.filter((session) => session.status !== "planned").length;

  return {
    startedOn,
    sessionsPlanned: inPlan.length,
    sessionsCompleted: completed,
    sessionsDecided: decided,
    adherencePct: decided > 0 ? Math.round((completed / decided) * 100) : null,
  };
}
