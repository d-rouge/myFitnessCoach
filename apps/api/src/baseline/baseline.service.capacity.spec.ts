import { beginnerPersona } from "@health-trainer/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MongoService } from "../database/mongo.service.js";

const activities: unknown[] = [];
let currentBaseline: unknown = null;

vi.mock("@health-trainer/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@health-trainer/db")>();
  return {
    ...actual,
    getActivitiesForCapacity: vi.fn(async () => activities),
    getCurrentBaseline: vi.fn(async () => currentBaseline),
    saveBaseline: vi.fn(async (_db: unknown, input: Record<string, unknown>) => ({
      ...input,
      id: "baseline_test",
      version: 1,
      validFrom: "2026-10-27T10:00:00.000Z",
      supersededAt: null,
    })),
  };
});

const { BaselineService } = await import("./baseline.service.js");

const mockMongo = {
  getDb: async () => ({}),
} as unknown as MongoService;

const baselineInput = (source: "manual" | "garmin" | "calibration") => {
  const {
    id: _id,
    userId: _userId,
    version: _version,
    validFrom: _from,
    supersededAt: _superseded,
    ...rest
  } = beginnerPersona;
  return {
    ...rest,
    profile: {
      ...rest.profile,
      capacity: { ...rest.profile.capacity, source },
    },
  };
};

describe("BaselineService capacity provenance", () => {
  beforeEach(() => {
    activities.length = 0;
    currentBaseline = null;
  });

  it("refuses a garmin-sourced baseline when nothing was imported", async () => {
    const service = new BaselineService(mockMongo);

    await expect(service.save("user-1", baselineInput("garmin"))).rejects.toThrow(
      /Nessuna attività importata/i,
    );
  });

  it("recomputes capacity from activities instead of trusting the client values", async () => {
    activities.push(
      {
        userId: "user-1",
        source: "garmin",
        externalId: "a1",
        sport: "running",
        start: "2026-10-26T07:00:00Z",
        localDate: "2026-10-26",
        durationSec: 3600,
        distanceM: 10_000,
        fetchedAt: "2026-10-26T08:00:00Z",
      },
      {
        userId: "user-1",
        source: "garmin",
        externalId: "a2",
        sport: "running",
        start: "2026-10-24T07:00:00Z",
        localDate: "2026-10-24",
        durationSec: 1800,
        distanceM: 5000,
        fetchedAt: "2026-10-24T08:00:00Z",
      },
    );

    const service = new BaselineService(mockMongo);
    const input = baselineInput("garmin");
    // Values invented by the client must be discarded.
    input.profile.capacity.activeWeeks = 500;
    input.profile.capacity.weeklySessions = 0;

    const saved = await service.save("user-1", input);

    expect(saved.profile.capacity.source).toBe("garmin");
    expect(saved.profile.capacity.activeWeeks).toBe(2);
    expect(saved.profile.capacity.weeklySessions).toBe(1);
    expect(saved.profile.capacity.recent5kSec).toBeGreaterThan(0);
    expect(saved.profile.capacity.asOf).toBeTruthy();
  });

  it("keeps manually entered capacity untouched", async () => {
    const service = new BaselineService(mockMongo);
    const input = baselineInput("manual");
    input.profile.capacity.activeWeeks = 42;

    const saved = await service.save("user-1", input);

    expect(saved.profile.capacity.activeWeeks).toBe(42);
    expect(saved.profile.capacity.source).toBe("manual");
  });

  it("derives the tier server-side from the measured capacity", async () => {
    const service = new BaselineService(mockMongo);
    const input = baselineInput("manual");
    input.profile.capacity.activeWeeks = 0;
    input.profile.capacity.weeklySessions = 0;
    input.profile.history = { sports: [] };

    const saved = await service.save("user-1", input);

    expect(saved.profile.experienceTier).toBe("novice");
  });

  it("hydrates capacity on read so the UI never shows stale zeros", async () => {
    // Document saved before the v2 model: no history, no capacity.
    currentBaseline = {
      ...beginnerPersona,
      profile: {
        birthDate: "1992-05-14",
        sex: beginnerPersona.profile.sex,
        heightCm: 178,
        weightKg: 78,
        sports: ["running"],
        timezone: "Europe/Rome",
        tone: beginnerPersona.profile.tone,
        units: "metric",
        experience: "beginner",
      },
    };
    activities.push({
      userId: "user-1",
      source: "garmin",
      externalId: "a1",
      sport: "running",
      start: "2026-10-25T07:00:00Z",
      localDate: "2026-10-25",
      durationSec: 17_490,
      distanceM: 42_641,
      fetchedAt: "2026-10-25T08:00:00Z",
    });

    const service = new BaselineService(mockMongo);
    const current = await service.getCurrent("user-1");

    // `experience: "beginner"` normalizes to `calibration`, which is a promise:
    // the measurement replaces the placeholder zeros.
    expect(current?.profile.capacity.source).toBe("garmin");
    expect(current?.profile.capacity.longestRecentSessionMin).toBe(292);
    expect(current?.profile.capacity.asOf).toBeTruthy();
    expect(current?.profile.experienceTier).toBeDefined();
  });

  it("never overwrites capacity entered by hand", async () => {
    currentBaseline = beginnerPersona;
    activities.push({
      userId: "user-1",
      source: "garmin",
      externalId: "a1",
      sport: "running",
      start: "2026-10-25T07:00:00Z",
      localDate: "2026-10-25",
      durationSec: 17_490,
      distanceM: 42_641,
      fetchedAt: "2026-10-25T08:00:00Z",
    });

    const service = new BaselineService(mockMongo);
    const current = await service.getCurrent("user-1");

    expect(current?.profile.capacity.source).toBe("manual");
    expect(current?.profile.capacity.activeWeeks).toBe(
      beginnerPersona.profile.capacity.activeWeeks,
    );
  });
});
