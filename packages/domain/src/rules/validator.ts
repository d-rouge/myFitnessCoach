import type { MacroPlan } from "../schemas/plan";
import type { PlannedSession } from "../schemas/session";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export function validateMacroPlan(plan: MacroPlan): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (plan.startDate >= plan.endDate) {
    issues.push({
      code: "plan_dates",
      message: "Plan start date must be before end date.",
      severity: "error",
    });
  }

  const phases = [...plan.phases].sort((a, b) => a.startWeek - b.startWeek);
  if (phases[0]?.startWeek !== 1) {
    issues.push({
      code: "phase_start",
      message: "The first phase must start at week 1.",
      severity: "error",
    });
  }

  for (let index = 1; index < phases.length; index += 1) {
    const previous = phases[index - 1];
    const current = phases[index];
    if (previous && current && current.startWeek !== previous.endWeek + 1) {
      issues.push({
        code: "phase_gap",
        message: `Phase "${current.name}" must start at week ${previous.endWeek + 1}.`,
        severity: "error",
      });
    }
  }

  for (const phase of phases) {
    if (phase.endWeek > plan.totalWeeks) {
      issues.push({
        code: "phase_overflow",
        message: `Phase "${phase.name}" ends after the plan (${plan.totalWeeks} weeks).`,
        severity: "error",
      });
    }
    if (phase.endWeek < phase.startWeek) {
      issues.push({
        code: "phase_order",
        message: `Phase "${phase.name}" ends before it starts.`,
        severity: "error",
      });
    }
  }

  const lastPhase = phases.at(-1);
  if (lastPhase && lastPhase.endWeek !== plan.totalWeeks) {
    issues.push({
      code: "phase_coverage",
      message: "The last phase must end on the last week of the plan.",
      severity: "error",
    });
  }

  return issues;
}

export function validatePlannedSession(
  session: PlannedSession,
  restrictions: string[] = [],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (session.durationMin <= 0) {
    issues.push({
      code: "session_duration",
      message: "Session duration must be positive.",
      severity: "error",
    });
  }

  if (session.blocks.length === 0) {
    issues.push({
      code: "session_blocks",
      message: "Session has no blocks.",
      severity: "warning",
    });
  }

  const normalized = new Set(restrictions.map((item) => item.toLowerCase()));
  for (const contraindication of session.contraindications) {
    if (normalized.has(contraindication.toLowerCase())) {
      issues.push({
        code: "contraindication",
        message: `Session conflicts with restriction "${contraindication}".`,
        severity: "error",
      });
    }
  }

  return issues;
}

export function validatePlanSessions(
  sessions: PlannedSession[],
  restrictions: string[] = [],
): ValidationIssue[] {
  return sessions.flatMap((session) =>
    validatePlannedSession(session, restrictions).map((issue) => ({
      ...issue,
      code: `${session.id}:${issue.code}`,
    })),
  );
}
