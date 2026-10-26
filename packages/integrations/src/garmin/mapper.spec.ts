import { describe, expect, it } from "vitest";
import { buildGarminDailyMetrics, mapGarminActivities, mapGarminSport } from "./mapper";

const fetchedAt = "2026-10-26T10:00:00.000Z";

const summary = {
  calendarDate: "2026-10-25",
  movement: {
    steps: { value: 9000, goal: 10000, distanceInMeters: 8000 },
  },
  calories: { burnedResting: 1500, burnedActive: 600, burnedTotal: 2100 },
  heartRate: { restingValue: 52, minValue: 45, maxValue: 140 },
  intensityMinutes: { moderate: 20, vigorous: 10, goal: 150 },
  stress: { avgLevel: 30, maxLevel: 70 },
  bodyBattery: {
    minValue: 20,
    maxValue: 80,
    latestValue: 40,
    chargedValue: 50,
    drainedValue: 60,
  },
  respiration: { avgValue: 14.5 },
};

const sleep = {
  calendarDate: "2026-10-25",
  sleepTimeSeconds: 27000,
  deepSleepSeconds: 5400,
  lightSleepSeconds: 18000,
  remSleepSeconds: 3600,
  awakeSleepSeconds: 1800,
  sleepScores: { overall: { value: 82 } },
  sleepNeed: { actual: 480 },
  avgSleepStress: 20,
  averageRespirationValue: 14,
};

const hrv = {
  hrvSummary: {
    calendarDate: "2026-10-25",
    lastNightAvg: 65,
    weeklyAvg: 62,
    status: "BALANCED",
  },
};

const bodyBattery = [
  {
    date: "2026-10-25",
    charged: 50,
    drained: 60,
    bodyBatteryValuesArray: [
      [1, 20],
      [2, 80],
    ],
  },
];

const dailyHeartRate = {
  calendarDate: "2026-10-25",
  restingHeartRate: 52,
  lastSevenDaysAvgRestingHeartRate: 54,
};

const spo2 = {
  calendarDate: "2026-10-25",
  averageSpO2: 97,
  lowestSpO2: 93,
};

const weight = [{ date: "2026-10-25", weight: 74.2, bodyFat: 18.5 }];

describe("Garmin mapper", () => {
  it("maps activities to the canonical model", () => {
    const activities = mapGarminActivities(
      {
        activityList: [
          {
            activityId: 123,
            activityName: "Morning Run",
            startTimeLocal: "2026-10-25 07:30:00",
            startTimeGMT: "2026-10-25 06:30:00",
            activityType: { typeKey: "running" },
            distance: 10000,
            duration: 3000,
            averageHR: 150,
            maxHR: 170,
            avgPower: 250,
            normPower: 260,
            elevationGain: 50,
            calories: 700,
            aerobicTrainingEffect: 3.5,
            activityTrainingLoad: 120,
          },
        ],
      },
      { userId: "personal", fetchedAt },
    );

    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      source: "garmin",
      externalId: "123",
      sport: "running",
      start: "2026-10-25T06:30:00.000Z",
      localDate: "2026-10-25",
      durationSec: 3000,
      distanceM: 10000,
      avgPaceSecKm: 300,
      avgHr: 150,
      maxHr: 170,
      avgPower: 250,
      normalizedPower: 260,
      elevationGainM: 50,
      calories: 700,
      trainingEffect: 3.5,
      activityLoad: 120,
      title: "Morning Run",
    });
  });

  it("maps sport type keys", () => {
    expect(mapGarminSport("running")).toBe("running");
    expect(mapGarminSport("trail_running")).toBe("running");
    expect(mapGarminSport("road_biking")).toBe("cycling");
    expect(mapGarminSport("lap_swimming")).toBe("swimming");
    expect(mapGarminSport("strength_training")).toBe("strength");
    expect(mapGarminSport("yoga")).toBe("mobility");
    expect(mapGarminSport("walking")).toBe("other");
  });

  it("merges daily summaries, sleep, HRV, body battery, HR and SpO2", () => {
    const metrics = buildGarminDailyMetrics({
      userId: "personal",
      fetchedAt,
      summaries: { data: [summary] },
      sleep: [{ date: "2026-10-25", raw: sleep }],
      hrv: [{ date: "2026-10-25", raw: hrv }],
      bodyBattery,
      dailyHeartRate: [{ date: "2026-10-25", raw: dailyHeartRate }],
      spo2: [{ date: "2026-10-25", raw: spo2 }],
      weight,
    });

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      userId: "personal",
      date: "2026-10-25",
      source: "garmin",
      restingHr: 52,
      hrvAvgMs: 65,
      hrvWeeklyAvgMs: 62,
      hrvStatus: "BALANCED",
      sleepMinutes: 450,
      deepSleepMin: 90,
      lightSleepMin: 300,
      remSleepMin: 60,
      awakeMin: 30,
      sleepScore: 82,
      sleepNeedMin: 480,
      steps: 9000,
      stepGoal: 10000,
      distanceM: 8000,
      caloriesTotal: 2100,
      intensityModerateMin: 20,
      intensityVigorousMin: 10,
      stressAvg: 30,
      stressMax: 70,
      bodyBatteryMin: 20,
      bodyBatteryMax: 80,
      bodyBatteryEnd: 40,
      bodyBatteryCharged: 50,
      bodyBatteryDrained: 60,
      spo2Avg: 97,
      spo2Min: 93,
      weightKg: 74.2,
      bodyFatPct: 18.5,
    });
  });

  it("ignores empty payloads", () => {
    const metrics = buildGarminDailyMetrics({
      userId: "personal",
      fetchedAt,
      summaries: { data: [] },
      sleep: [],
      hrv: [],
      bodyBattery: [],
      dailyHeartRate: [],
      spo2: [],
      weight: [],
    });

    expect(metrics).toEqual([]);
  });
});
