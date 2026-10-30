import type { Baseline } from "../schemas/baseline";
import type { MethodologyDecision, MethodologyEnvelope } from "../schemas/methodology";
import { todayLocalDate } from "./dates";
import { planHorizonWeeks } from "./plan-horizon";
import type { RecentContext } from "./recent-context";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Costruisce il recinto di sicurezza della metodologia.
 *
 * Non sceglie la metodologia: calcola solo i limiti oltre i quali una proposta
 * dell'LLM non è più accettabile con i dati attuali. I limiti sono conservativi
 * e volutamente spiegati in `reasons`, così il modello sa perché.
 */
export function buildMethodologyEnvelope(
  baseline: Baseline,
  recentContext: RecentContext,
): MethodologyEnvelope {
  const availabilityDays = baseline.availability.daysPerWeek ?? baseline.availability.days.length;
  const maxSessionsPerWeek = clamp(availabilityDays, 1, 7);
  const tier = baseline.profile.experienceTier;
  const recovery = recentContext.postRaceRecovery.active;
  const conservative = tier === "novice" || tier === "returning";

  const recentWeeklyMinutes = recentContext.load28dMin / 4;
  const estimatedWeeklyMinutes =
    recentWeeklyMinutes > 0 ? recentWeeklyMinutes : maxSessionsPerWeek * 45;
  // +20% è il margine massimo di progressione settimanale che accettiamo in
  // questa fase; il generatore dettagliato applica comunque i suoi tetti.
  const maxWeeklyMinutes = clamp(Math.round(estimatedWeeklyMinutes * 1.2), 180, 720);

  const maxQualitySessions = recovery ? 0 : conservative ? 1 : maxSessionsPerWeek >= 4 ? 2 : 1;

  const maxLongSessionMin = recovery ? 30 : conservative ? 60 : tier === "trained" ? 90 : 120;

  const maxStrengthSessions = recovery ? 1 : Math.min(3, maxSessionsPerWeek);

  const startDate = todayLocalDate(baseline.profile.timezone, new Date(recentContext.asOf));
  const targetDate = baseline.goals.primary.targetDate ?? null;
  const fallbackWeeks = baseline.goals.primary.type === "race" ? 12 : 8;
  const horizonWeeks = planHorizonWeeks(startDate, targetDate, fallbackWeeks);

  const hasActivePain = baseline.anamnesis.injuries.some(
    (injury) => injury.status !== "resolved" && injury.painLevel >= 4,
  );
  const plyometricsAllowed =
    !recovery &&
    (tier === "trained" || tier === "highly_trained") &&
    !hasActivePain &&
    baseline.anamnesis.redFlags.length === 0;

  const reasons: string[] = [
    `Disponibilità dichiarata: ${maxSessionsPerWeek} giorni/settimana.`,
    `Livello ${tier}: massimo ${maxQualitySessions} sedute di qualità e lungo fino a ${maxLongSessionMin} min.`,
    `Carico recente: circa ${Math.round(estimatedWeeklyMinutes)} min/settimana; tetto proposto ${maxWeeklyMinutes} min.`,
    targetDate
      ? `Data target ${targetDate}: orizzonte di ${horizonWeeks} settimane.`
      : `Nessuna data target: orizzonte standard di ${horizonWeeks} settimane.`,
  ];
  if (recovery) {
    reasons.push(
      `Recupero post-gara attivo (${recentContext.postRaceRecovery.weeks} settimane): in questo blocco niente qualità, lungo ≤30 min, forza ridotta e pliometria esclusa. Dopo la finestra la periodizzazione può reintrodurre qualità e lungo.`,
    );
  } else if (!plyometricsAllowed) {
    reasons.push(
      hasActivePain || baseline.anamnesis.redFlags.length > 0
        ? "Dolore attivo o red flag: pliometria esclusa."
        : "Pliometria consentita solo con livello allenato/agonistico e nessun dolore attivo.",
    );
  }

  return {
    maxSessionsPerWeek,
    maxQualitySessions,
    maxLongSessionMin,
    maxStrengthSessions,
    maxWeeklyMinutes,
    plyometricsAllowed,
    horizonWeeks,
    reasons,
  };
}

/**
 * Verifica che le fasi del macrociclo siano continue e coprano l'orizzonte.
 * Il modello può sbagliare i confini: qui lo scopriamo prima di generare.
 */
function validateMethodologyPhases(
  decision: MethodologyDecision,
  envelope: MethodologyEnvelope,
): string[] {
  const phases = decision.phases;
  if (!phases || phases.length === 0) return [];

  const issues: string[] = [];
  const sorted = [...phases].sort((a, b) => a.startWeek - b.startWeek);

  if (sorted[0]?.startWeek !== 1) {
    issues.push("Le fasi devono iniziare dalla settimana 1.");
  }

  for (let index = 0; index < sorted.length; index += 1) {
    const phase = sorted[index];
    if (!phase) continue;
    if (phase.endWeek < phase.startWeek) {
      issues.push(`Fase "${phase.name}": endWeek precede startWeek.`);
    }
    const previous = sorted[index - 1];
    if (previous && phase.startWeek !== previous.endWeek + 1) {
      issues.push(
        `Fase "${phase.name}" deve iniziare dalla settimana ${previous.endWeek + 1}, non ${phase.startWeek}.`,
      );
    }
  }

  const last = sorted.at(-1);
  if (last && last.endWeek !== envelope.horizonWeeks) {
    issues.push(
      `L'ultima fase deve chiudersi alla settimana ${envelope.horizonWeeks} (orizzonte), non ${last.endWeek}.`,
    );
  }

  const taperWeeks = decision.periodization?.taperWeeks ?? 0;
  if (taperWeeks > 0) {
    // Il taper si misura in settimane: l'ultima fase può coprirne più di una.
    let actualTaper = 0;
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const phase = sorted[index];
      if (!phase?.deload) break;
      actualTaper += phase.endWeek - phase.startWeek + 1;
    }
    if (actualTaper < taperWeeks) {
      issues.push(
        `Le ultime ${taperWeeks} settimane devono essere di taper/scarico: ne risultano ${actualTaper}.`,
      );
    }
  }

  return issues;
}

export interface MethodologyValidation {
  valid: boolean;
  issues: string[];
}

/**
 * Verifica che la metodologia scelta dall'LLM stia dentro il recinto. Non
 * giudica la qualità scientifica della scelta: quella è responsabilità del
 * modello e della review. Qui si controllano solo coerenza e sicurezza.
 */
export function validateMethodology(
  decision: MethodologyDecision,
  envelope: MethodologyEnvelope,
): MethodologyValidation {
  const issues: string[] = [];
  const { weeklyStructure } = decision;

  if (weeklyStructure.sessions > envelope.maxSessionsPerWeek) {
    issues.push(
      `Sedute settimanali ${weeklyStructure.sessions} > disponibilità ${envelope.maxSessionsPerWeek}.`,
    );
  }
  if (weeklyStructure.qualitySessions > envelope.maxQualitySessions) {
    issues.push(
      `Sedute di qualità ${weeklyStructure.qualitySessions} > massimo ${envelope.maxQualitySessions}.`,
    );
  }
  if (weeklyStructure.longSessionMin > envelope.maxLongSessionMin) {
    issues.push(
      `Seduta lunga ${weeklyStructure.longSessionMin} min > massimo ${envelope.maxLongSessionMin} min.`,
    );
  }
  if (weeklyStructure.strengthSessions > envelope.maxStrengthSessions) {
    issues.push(
      `Sedute di forza ${weeklyStructure.strengthSessions} > massimo ${envelope.maxStrengthSessions}.`,
    );
  }
  if (
    weeklyStructure.weeklyMinutes !== undefined &&
    weeklyStructure.weeklyMinutes > envelope.maxWeeklyMinutes
  ) {
    issues.push(
      `Volume settimanale ${weeklyStructure.weeklyMinutes} min > tetto ${envelope.maxWeeklyMinutes} min.`,
    );
  }
  if (weeklyStructure.plyometrics && !envelope.plyometricsAllowed) {
    issues.push("Pliometria proposta ma non consentita dai dati attuali.");
  }
  if (weeklyStructure.qualitySessions > weeklyStructure.sessions) {
    issues.push("Le sedute di qualità non possono superare il numero di sedute.");
  }
  if (weeklyStructure.strengthSessions > weeklyStructure.sessions) {
    issues.push("Le sedute di forza non possono superare il numero di sedute.");
  }

  const periodization = decision.periodization;
  if (!periodization) {
    issues.push("Periodizzazione mancante: indica modello, settimane di carico/scarico e taper.");
  } else {
    if (periodization.taperWeeks > envelope.horizonWeeks) {
      issues.push(
        `Taper di ${periodization.taperWeeks} settimane > orizzonte ${envelope.horizonWeeks}.`,
      );
    }
    if (
      periodization.deloadWeeks > 0 &&
      periodization.loadWeeks + periodization.deloadWeeks > envelope.horizonWeeks
    ) {
      issues.push(
        `Ciclo ${periodization.loadWeeks}+${periodization.deloadWeeks} settimane > orizzonte ${envelope.horizonWeeks}.`,
      );
    }
    if (periodization.deloadWeeks === 0 && envelope.horizonWeeks >= 8) {
      issues.push("Con un orizzonte di 8+ settimane serve almeno una settimana di scarico.");
    }
  }

  issues.push(...validateMethodologyPhases(decision, envelope));

  return { valid: issues.length === 0, issues };
}
