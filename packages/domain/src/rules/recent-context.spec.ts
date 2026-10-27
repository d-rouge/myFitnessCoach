import { describe, expect, it } from "vitest";
import { buildRecentContext, type ContextActivity } from "./recent-context";

const NOW = "2026-10-27T10:00:00.000Z";

function activity(patch: Partial<ContextActivity> & { localDate: string }): ContextActivity {
  return {
    sport: "running",
    durationSec: 3600,
    ...patch,
  };
}

describe("buildRecentContext", () => {
  it("blocks loading after a marathon run two days ago", () => {
    const context = buildRecentContext(
      [activity({ localDate: "2026-10-25", distanceM: 42_195, durationSec: 14_400 })],
      { now: NOW },
    );

    expect(context.postRaceRecovery.active).toBe(true);
    expect(context.postRaceRecovery.weeks).toBe(3);
    expect(context.postRaceRecovery.untilDate).toBe("2026-11-15");
    expect(context.flags).toContain("post_race_recovery");
    expect(context.postRaceRecovery.reason).toMatch(/maratona/i);
  });

  it("treats a half marathon as a shorter window", () => {
    const context = buildRecentContext(
      [activity({ localDate: "2026-10-20", distanceM: 21_097, durationSec: 6_300 })],
      { now: NOW },
    );

    // 14 days of recovery, 7 elapsed -> one week left.
    expect(context.postRaceRecovery.active).toBe(true);
    expect(context.postRaceRecovery.weeks).toBe(1);
  });

  it("expires the recovery window once the days have passed but keeps the context", () => {
    const context = buildRecentContext(
      [activity({ localDate: "2026-10-05", distanceM: 21_097, durationSec: 6_300 })],
      { now: NOW },
    );

    expect(context.postRaceRecovery.active).toBe(false);
    expect(context.postRaceRecovery.weeks).toBe(0);
    expect(context.lastLongEffort?.daysAgo).toBe(22);
    expect(context.flags).toContain("long_effort_recent");
    expect(context.flags).not.toContain("post_race_recovery");
  });

  it("detects a load spike from acute versus chronic volume", () => {
    const context = buildRecentContext(
      [
        activity({ localDate: "2026-10-26", durationSec: 7200 }),
        activity({ localDate: "2026-10-25", durationSec: 7200 }),
        activity({ localDate: "2026-10-24", durationSec: 7200 }),
        activity({ localDate: "2026-09-30", durationSec: 1800 }),
      ],
      { now: NOW },
    );

    expect(context.acuteChronicRatio).toBeGreaterThan(1.5);
    expect(context.flags).toContain("load_spike");
  });

  it("flags a detraining gap", () => {
    const context = buildRecentContext([activity({ localDate: "2026-09-20" })], { now: NOW });

    expect(context.daysSinceLastActivity).toBe(37);
    expect(context.flags).toContain("detraining_gap");
  });

  it("returns a neutral context with no activities", () => {
    const context = buildRecentContext([], { now: NOW });

    expect(context.lastActivityDate).toBeNull();
    expect(context.postRaceRecovery.active).toBe(false);
    expect(context.acuteChronicRatio).toBeNull();
    expect(context.flags).toEqual([]);
  });
});
