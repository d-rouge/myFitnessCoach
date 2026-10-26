import type { Checkin } from "../schemas/checkin";
import type { MicroPlan } from "../schemas/plan";
import type { Review, ReviewDecision } from "../schemas/review";

export interface WeeklyReviewInput {
  userId: string;
  microPlan: MicroPlan;
  checkins?: Checkin[];
}

export function computeWeeklyReview(input: WeeklyReviewInput): Review {
  const { userId, microPlan, checkins = [] } = input;

  const plannedSessionsCount = microPlan.sessions.length;
  const completedSessions = microPlan.sessions.filter(
    (s) => s.status === "completed" || s.status === "adjusted",
  );
  const completedSessionsCount = completedSessions.length;

  const adherencePct =
    plannedSessionsCount === 0
      ? 100
      : Math.min(100, Math.round((completedSessionsCount / plannedSessionsCount) * 100));

  const totalDurationMin = completedSessions.reduce((sum, s) => sum + s.durationMin, 0);

  const painEventsCount = checkins.filter((c) => c.pain.some((p) => p.intensity >= 4)).length;

  let decision: ReviewDecision = "continue";
  let decisionRationale = "";
  const nextCycleRecommendations: string[] = [];

  if (painEventsCount >= 2) {
    decision = "deload";
    decisionRationale = `Rilevati ${painEventsCount} episodi di dolore significativo durante la settimana. Si raccomanda una settimana di scarico e de-tensionamento articolare.`;
    nextCycleRecommendations.push(
      "Introdurre sessioni di cross-training a basso impatto (nuoto/bici)",
      "Ridurre l'intensità delle ripetute e il volume del 30%",
      "Aumentare lo stretching della catena posteriore e mobilità foam roller",
    );
  } else if (adherencePct < 60) {
    decision = "continue";
    decisionRationale = `Aderenza al ${adherencePct}% (${completedSessionsCount}/${plannedSessionsCount} sessioni). Mantieni il volume attuale per consolidare l'abitudine prima di progredire.`;
    nextCycleRecommendations.push(
      "Pianifica in anticipo gli orari delle sessioni nel calendario",
      "Sfrutta le varianti espresse da 15 o 30 minuti nei giorni impegnati",
    );
  } else if (adherencePct >= 80 && !microPlan.deload) {
    decision = "progress";
    decisionRationale = `Ottima aderenza (${adherencePct}%) e nessun campanello d'allarme fisico. Pronto per incrementare gradualmente il carico (regola del 10%).`;
    nextCycleRecommendations.push(
      "Aumentare leggermente la durata del lungo settimanale (+10%)",
      "Mantenere il focus sull'esecuzione tecnica e idratazione post-sessione",
    );
  } else {
    decision = "continue";
    decisionRationale = `Settimana completata regolarmente con aderenza del ${adherencePct}%. Procedi secondo il macrociclo.`;
    nextCycleRecommendations.push("Continua con la routine pianificata");
  }

  const coachSummary = `Settimana ${microPlan.weekIndex} chiusa con ${completedSessionsCount}/${plannedSessionsCount} sessioni completate e ${totalDurationMin} min di volume attivo. Aderenza complessiva: ${adherencePct}%.`;

  return {
    id: `review_${microPlan.id}_${Date.now()}`,
    userId,
    kind: "weekly",
    startDate: microPlan.startDate,
    endDate: microPlan.endDate,
    plannedSessionsCount,
    completedSessionsCount,
    adherencePct,
    totalLoad: microPlan.targetLoad ?? 0,
    totalDurationMin,
    painEventsCount,
    decision,
    decisionRationale,
    coachSummary,
    nextCycleRecommendations,
  };
}
