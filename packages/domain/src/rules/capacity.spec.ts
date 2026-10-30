import { describe, expect, it } from "vitest";
import { type CapacityActivity, estimateCapacityFromActivities } from "./capacity";

const NOW = "2026-10-27T10:00:00.000Z";

function run(localDate: string, durationSec: number, distanceM: number): CapacityActivity {
  return { sport: "running", start: `${localDate}T07:00:00Z`, localDate, durationSec, distanceM };
}

describe("estimateCapacityFromActivities", () => {
  it("reports unavailability instead of inventing zeros when there is nothing to measure", () => {
    const estimate = estimateCapacityFromActivities([], { now: NOW });

    expect(estimate.available).toBe(false);
    expect(estimate.warnings).toContain("no_activities");
    expect(estimate.capacity.source).toBe("garmin");
  });

  it("counts consecutive active weeks walking back from now", () => {
    const estimate = estimateCapacityFromActivities(
      [
        run("2026-10-26", 1800, 5000),
        run("2026-10-19", 1800, 5000),
        run("2026-10-12", 1800, 5000),
        run("2026-10-05", 1800, 5000),
        // Gap here: the streak must stop at four weeks.
        run("2026-09-01", 1800, 5000),
      ],
      { now: NOW },
    );

    expect(estimate.capacity.activeWeeks).toBe(4);
  });

  it("tolerates one empty week so a rest week does not reset the streak", () => {
    const estimate = estimateCapacityFromActivities(
      [run("2026-10-19", 1800, 5000), run("2026-10-05", 1800, 5000), run("2026-09-28", 1800, 5000)],
      { now: NOW },
    );

    expect(estimate.capacity.activeWeeks).toBe(3);
  });

  it("returns zero consistency when the last activity is older than two weeks", () => {
    const estimate = estimateCapacityFromActivities([run("2026-09-01", 1800, 5000)], {
      now: NOW,
    });

    expect(estimate.capacity.activeWeeks).toBe(0);
    expect(estimate.warnings).toContain("inactive_over_4_weeks");
  });

  it("derives sessions per week and the longest recent session from the last 4 weeks", () => {
    const estimate = estimateCapacityFromActivities(
      [
        run("2026-10-26", 3600, 9000),
        run("2026-10-24", 1800, 5000),
        run("2026-10-22", 1800, 5000),
        run("2026-10-20", 1800, 5000),
        run("2026-10-18", 1800, 5000),
        run("2026-10-16", 1800, 5000),
        run("2026-10-14", 1800, 5000),
        run("2026-10-12", 1800, 5000),
      ],
      { now: NOW },
    );

    expect(estimate.capacity.weeklySessions).toBe(2);
    expect(estimate.capacity.longestRecentSessionMin).toBe(60);
    expect(estimate.capacity.lastActivityDate).toBe("2026-10-26");
  });

  it("summarizes activity count and training time over the last 90 days", () => {
    const estimate = estimateCapacityFromActivities(
      [
        run("2026-10-26", 3600, 10_000),
        {
          sport: "cycling",
          start: "2026-10-01T07:00:00Z",
          localDate: "2026-10-01",
          durationSec: 7200,
        },
        // Outside the 90-day summary window.
        run("2026-07-28", 5400, 15_000),
      ],
      { now: NOW },
    );

    expect(estimate.coverage.activitiesLast90Days).toBe(2);
    expect(estimate.coverage.durationSecondsLast90Days).toBe(10_800);
  });

  it("projects a 5k time from the best recent reference run", () => {
    // 10k in 50 minutes -> ~23:55 for 5k with Riegel (exp 1.06).
    const estimate = estimateCapacityFromActivities([run("2026-10-25", 3000, 10_000)], {
      now: NOW,
    });

    expect(estimate.capacity.recent5kSec).toBeGreaterThan(1400);
    expect(estimate.capacity.recent5kSec).toBeLessThan(1500);
  });

  it("ignores runs too short to project and non-running activities for the 5k reference", () => {
    const estimate = estimateCapacityFromActivities(
      [
        run("2026-10-25", 600, 2000),
        {
          sport: "cycling",
          start: "2026-10-24T07:00:00Z",
          localDate: "2026-10-24",
          durationSec: 3600,
        },
      ],
      { now: NOW },
    );

    expect(estimate.capacity.recent5kSec).toBeNull();
    expect(estimate.warnings).toContain("no_5k_reference");
  });

  it("counts the 28-day window in the athlete's timezone, not in UTC", () => {
    // 00:30 on 28 July in Rome (CEST, UTC+2), still 27 July in UTC.
    const now = "2026-07-27T22:30:00.000Z";
    // Exactly 28 days before the 28th, 27 before the 27th.
    const activities = [run("2026-06-30", 1800, 5000)];

    const utc = estimateCapacityFromActivities(activities, { now });
    const rome = estimateCapacityFromActivities(activities, { now, timezone: "Europe/Rome" });

    expect(utc.capacity.longestRecentSessionMin).toBe(30);
    expect(rome.capacity.longestRecentSessionMin).toBe(0);
  });
});
