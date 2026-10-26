export interface ProgressionInput {
  previousWeekMin: number;
  nextWeekMin: number;
  longRunMin?: number;
  maxWeeklyIncrease?: number;
}

export interface ProgressionIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export function weeklyVolumeCap(previousWeekMin: number, maxIncrease = 0.1): number {
  return Math.round(previousWeekMin * (1 + maxIncrease));
}

export function isDeloadWeek(weekIndex: number, every = 4): boolean {
  return weekIndex > 0 && weekIndex % every === 0;
}

export function longRunCap(weeklyVolumeMin: number, ratio = 0.35): number {
  return Math.round(weeklyVolumeMin * ratio);
}

export function validateProgression(input: ProgressionInput): ProgressionIssue[] {
  const issues: ProgressionIssue[] = [];
  const maxIncrease = input.maxWeeklyIncrease ?? 0.1;
  const cap = weeklyVolumeCap(input.previousWeekMin, maxIncrease);

  if (input.nextWeekMin > cap) {
    issues.push({
      code: "weekly_volume_increase",
      message: `Weekly volume ${input.nextWeekMin} min exceeds the ${Math.round(maxIncrease * 100)}% cap (${cap} min).`,
      severity: "error",
    });
  }

  if (input.longRunMin !== undefined) {
    const capLongRun = longRunCap(input.nextWeekMin);
    if (input.longRunMin > capLongRun) {
      issues.push({
        code: "long_run_share",
        message: `Long run ${input.longRunMin} min exceeds 35% of weekly volume (${capLongRun} min).`,
        severity: "warning",
      });
    }
  }

  if (input.previousWeekMin > 0 && input.nextWeekMin < input.previousWeekMin * 0.6) {
    issues.push({
      code: "weekly_volume_drop",
      message: "Weekly volume drops by more than 40%; verify that this is a deload or taper.",
      severity: "warning",
    });
  }

  return issues;
}
