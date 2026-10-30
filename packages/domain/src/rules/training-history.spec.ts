import { describe, expect, it } from "vitest";
import type { Activity } from "../schemas/activity";
import { buildTrainingHistory } from "./training-history";

const activity = (input: {
  localDate: string;
  sport: Activity["sport"];
  durationSec: number;
  distanceM?: number;
  paceSecKm?: number;
  trainingEffect?: number;
  title?: string;
  activityType?: string;
}): Activity => ({
  userId: "user-1",
  source: "garmin",
  externalId: `ext-${input.localDate}-${input.sport}-${input.durationSec}`,
  sport: input.sport,
  activityType: input.activityType,
  start: `${input.localDate}T07:00:00.000Z`,
  localDate: input.localDate,
  durationSec: input.durationSec,
  distanceM: input.distanceM,
  avgPaceSecKm: input.paceSecKm,
  trainingEffect: input.trainingEffect,
  title: input.title,
  fetchedAt: "2026-10-30T08:00:00.000Z",
});

describe("buildTrainingHistory", () => {
  const now = "2026-10-30T08:00:00.000Z";
  const activities: Activity[] = [
    activity({
      localDate: "2026-10-29",
      sport: "running",
      durationSec: 20 * 60,
      distanceM: 2800,
      paceSecKm: 432,
      trainingEffect: 2.3,
      title: "Recupero",
      activityType: "running",
    }),
    activity({
      localDate: "2026-10-25",
      sport: "running",
      durationSec: 171 * 60,
      distanceM: 25_300,
      paceSecKm: 407,
      trainingEffect: 4.7,
      title: "Lunga",
      activityType: "running",
    }),
    activity({
      localDate: "2026-10-22",
      sport: "running",
      durationSec: 50 * 60,
      distanceM: 10_000,
      paceSecKm: 300,
      trainingEffect: 3,
      title: "Corsa",
      activityType: "running",
    }),
    activity({
      localDate: "2026-10-20",
      sport: "strength",
      durationSec: 45 * 60,
      activityType: "strength_training",
      title: "Palestra",
    }),
    activity({
      localDate: "2026-10-18",
      sport: "running",
      durationSec: 60 * 60,
      distanceM: 10_000,
      paceSecKm: 360,
      trainingEffect: 3,
      activityType: "running",
    }),
    // Fuori da entrambe le finestre (14 + 14 giorni).
    activity({
      localDate: "2026-09-20",
      sport: "running",
      durationSec: 30 * 60,
      distanceM: 4500,
      paceSecKm: 400,
    }),
    // Finestra precedente, usata per il trend.
    activity({
      localDate: "2026-10-10",
      sport: "running",
      durationSec: 60 * 60,
      distanceM: 12_000,
      paceSecKm: 300,
    }),
    activity({
      localDate: "2026-10-12",
      sport: "running",
      durationSec: 50 * 60,
      distanceM: 10_000,
      paceSecKm: 300,
    }),
  ];

  it("riassume le ultime due settimane con tipo di seduta e trend", () => {
    const history = buildTrainingHistory(activities, { now, timezone: "Europe/Rome" });

    expect(history.windowDays).toBe(14);
    expect(history.from).toBe("2026-10-17");
    expect(history.to).toBe("2026-10-30");
    expect(history.entries).toHaveLength(5);
    expect(history.summary.sessions).toBe(5);
    expect(history.summary.bySport.running).toBe(4);
    expect(history.summary.bySport.strength).toBe(1);
    expect(history.summary.kinds).toMatchObject({
      easy: 2,
      long: 1,
      quality: 1,
      strength: 1,
    });
    expect(history.summary.hardSharePct).toBe(20);
    expect(history.summary.longestSessionMin).toBe(171);
    expect(history.summary.longestDistanceKm).toBe(25.3);
    expect(history.summary.distanceKm).toBe(48.1);

    expect(history.previous.sessions).toBe(2);
    expect(history.trend.sessionsDelta).toBe(3);
    expect(history.trend.distanceDeltaPct).toBe(119);
  });

  it("conserva il tipo grezzo del provider", () => {
    const history = buildTrainingHistory(activities, { now, timezone: "Europe/Rome" });
    const strength = history.entries.find((entry) => entry.sport === "strength");

    expect(strength?.activityType).toBe("strength_training");
    expect(strength?.kind).toBe("strength");
  });

  it("riconosce una gara dal titolo", () => {
    const history = buildTrainingHistory(
      [
        activity({
          localDate: "2026-10-28",
          sport: "running",
          durationSec: 90 * 60,
          distanceM: 21_000,
          paceSecKm: 257,
          title: "Mezza maratona di Venezia",
        }),
      ],
      { now, timezone: "Europe/Rome" },
    );

    expect(history.entries[0]?.kind).toBe("race");
  });
});
