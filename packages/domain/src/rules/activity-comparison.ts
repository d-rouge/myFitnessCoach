import type { Activity } from "../schemas/activity";
import type { PlannedSession } from "../schemas/session";

export interface SessionComparisonResult {
  sessionId: string;
  activityId: string;
  sport: string;
  plannedDurationMin: number;
  actualDurationMin: number;
  durationDeltaMin: number;
  durationMatch: "on_target" | "under" | "over";
  adherenceScore: number; // 0..100
  summary: string;
  flags: string[];
}

export function compareSessionWithActivity(
  session: PlannedSession,
  activity: Activity,
): SessionComparisonResult {
  const actualDurationMin = Math.round(activity.durationSec / 60);
  const plannedDurationMin = session.durationMin;
  const durationDeltaMin = actualDurationMin - plannedDurationMin;

  const durationRatio = actualDurationMin / Math.max(1, plannedDurationMin);
  let durationMatch: "on_target" | "under" | "over" = "on_target";
  const flags: string[] = [];

  if (durationRatio < 0.8) {
    durationMatch = "under";
    flags.push("duration_below_target");
  } else if (durationRatio > 1.25) {
    durationMatch = "over";
    flags.push("duration_exceeded_target");
  }

  // Calculate adherence score (0..100)
  // Penalize deviating too much from planned duration
  const ratioDistance = Math.abs(1 - durationRatio);
  const adherenceScore = Math.max(
    0,
    Math.min(100, Math.round((1 - Math.min(ratioDistance, 1)) * 100)),
  );

  if (activity.sport !== session.sport) {
    flags.push("cross_sport_substitution");
  }

  let summary = `Completati ${actualDurationMin} min su ${plannedDurationMin} min previsti (${adherenceScore}% aderenza).`;
  if (durationMatch === "under") {
    summary += ` Durata inferiore al target di ${Math.abs(durationDeltaMin)} minuti.`;
  } else if (durationMatch === "over") {
    summary += ` Sessione prolungata di ${durationDeltaMin} minuti oltre il previsto.`;
  } else {
    summary += " Obiettivo di durata centrato perfettamente.";
  }

  return {
    sessionId: session.id,
    activityId: activity.externalId,
    sport: activity.sport,
    plannedDurationMin,
    actualDurationMin,
    durationDeltaMin,
    durationMatch,
    adherenceScore,
    summary,
    flags,
  };
}
