import type { Goal, GoalSet, GoalType } from "../schemas/goal";

const RACE_PATTERNS = [
  /\bgara\b/i,
  /\bmaratona\b/i,
  /\bmezza\b/i,
  /\btrail\b/i,
  /\btriathlon\b/i,
  /\bcompetitiv/i,
  /\bcampionato\b/i,
];

const PERFORMANCE_PATTERNS = [
  /\b5\s?k(m)?\b/i,
  /\b10\s?k(m)?\b/i,
  /\b21\s?k(m)?\b/i,
  /\b42\s?k(m)?\b/i,
  /\btempo\b/i,
  /\bminuti\b/i,
  /\bvelocit/i,
  /\bpb\b/i,
  /\brecord\b/i,
];

const BODY_PATTERNS = [/peso/i, /dimagr/i, /massa/i, /grasso/i, /composizione/i];

const STRENGTH_PATTERNS = [/forza/i, /ipertrofia/i, /palestra/i, /muscol/i];

const HABIT_PATTERNS = [/costanza/i, /abitudine/i, /regolar/i];

const HEALTH_PATTERNS = [/salute/i, /benessere/i, /riabilit/i, /postura/i];

const matches = (text: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(text));

/**
 * Deduce il tipo di obiettivo dalla descrizione, senza chiedere all'atleta di
 * scegliere una categoria. La descrizione resta il testo che arriva al modello
 * di pianificazione; il tipo serve solo alle regole deterministiche (durata del
 * macrociclo, gestione della settimana di gara).
 *
 * L'ordine conta: "maratona in meno di 3 ore" è una gara, non una performance
 * generica.
 */
export function inferGoalType(description: string): GoalType {
  const text = description.trim();
  if (text.length === 0) return "performance";
  if (matches(text, RACE_PATTERNS)) return "race";
  if (matches(text, PERFORMANCE_PATTERNS)) return "performance";
  if (matches(text, BODY_PATTERNS)) return "body_composition";
  if (matches(text, STRENGTH_PATTERNS)) return "strength";
  if (matches(text, HABIT_PATTERNS)) return "habit";
  if (matches(text, HEALTH_PATTERNS)) return "health";
  return "performance";
}

export function withInferredGoalType(goal: Goal): Goal {
  return { ...goal, type: inferGoalType(goal.description) };
}

/** Riallinea il tipo di tutti gli obiettivi alla descrizione, lato server. */
export function withInferredGoalTypes(goals: GoalSet): GoalSet {
  return {
    primary: withInferredGoalType(goals.primary),
    secondary: goals.secondary.map(withInferredGoalType),
  };
}
