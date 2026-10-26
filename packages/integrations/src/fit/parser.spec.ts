import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractFitActivity, unzipFit } from "./parser";

const fetchedAt = "2026-10-26T10:00:00.000Z";

const parsed = {
  sessions: [
    {
      sport: "running",
      sub_sport: "generic",
      start_time: new Date("2026-10-25T06:30:00.000Z"),
      total_timer_time: 3000,
      total_elapsed_time: 3100,
      total_distance: 10000,
      enhanced_avg_speed: 3.333333,
      avg_heart_rate: 150,
      max_heart_rate: 180,
      avg_cadence: 170,
      max_cadence: 180,
      total_ascent: 50,
      total_descent: 40,
      total_calories: 700,
      total_training_effect: 3.5,
      total_anaerobic_training_effect: 1.1,
    },
  ],
  laps: [
    {
      message_index: { value: 0 },
      total_timer_time: 750,
      total_distance: 2500,
      enhanced_avg_speed: 3.333333,
      avg_heart_rate: 145,
      max_heart_rate: 160,
      total_ascent: 10,
      total_calories: 170,
      lap_trigger: "distance",
    },
  ],
  splits: [
    {
      message_index: { value: 0 },
      total_timer_time: 600,
      total_distance: 2000,
      avg_speed: 3.333333,
    },
    {
      message_index: { value: 1 },
      total_timer_time: 600,
      total_distance: 2000,
      avg_speed: 3.333333,
    },
    {
      message_index: { value: 2 },
      total_timer_time: 540,
      total_distance: 2000,
      avg_speed: 3.703703,
    },
    {
      message_index: { value: 3 },
      total_timer_time: 540,
      total_distance: 2000,
      avg_speed: 3.703703,
    },
  ],
  records: Array.from({ length: 100 }, (_, index) => ({
    heart_rate: index < 50 ? 140 : 150,
  })),
  time_in_zone: [
    {
      reference_mesg: "session",
      time_in_hr_zone: [300, 600, 900, 600, 300],
    },
  ],
};

describe("FIT activity parser", () => {
  it("extracts summary, laps, splits and zones", () => {
    const analysis = extractFitActivity(parsed, {
      userId: "personal",
      externalId: "123",
      fetchedAt,
    });

    expect(analysis).toMatchObject({
      userId: "personal",
      externalId: "123",
      source: "garmin",
      sport: "running",
      date: "2026-10-25",
      summary: {
        durationSec: 3000,
        distanceM: 10000,
        avgHr: 150,
        maxHr: 180,
        avgPaceSecKm: 300,
        calories: 700,
        trainingEffect: 3.5,
      },
    });
    expect(analysis.laps).toHaveLength(1);
    expect(analysis.splits).toHaveLength(4);
    expect(analysis.hrZones).toEqual([
      { zone: 1, minutes: 5 },
      { zone: 2, minutes: 10 },
      { zone: 3, minutes: 15 },
      { zone: 4, minutes: 10 },
      { zone: 5, minutes: 5 },
    ]);
    expect(analysis.derived.bestSplitPaceSecKm).toBe(270);
    expect(analysis.derived.worstSplitPaceSecKm).toBe(300);
    expect(analysis.derived.negativeSplit).toBe(true);
    expect(analysis.brief).toContain("## Attività");
    expect(analysis.brief).toContain("Passo medio: 5:00/km");
    expect(analysis.brief).toContain("Negative split: sì");
  });

  it("rejects a FIT without a session", () => {
    expect(() =>
      extractFitActivity(
        { records: [] },
        {
          userId: "personal",
          externalId: "123",
          fetchedAt,
        },
      ),
    ).toThrow(/session/i);
  });

  it("extracts the first FIT from a ZIP", () => {
    const zip = zipSync({
      "activity.fit": new Uint8Array([0x0e, 0x10]),
      "readme.txt": new Uint8Array([1, 2, 3]),
    });

    expect(unzipFit(zip)).toEqual(new Uint8Array([0x0e, 0x10]));
  });
});
