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

  it("keeps the declared 5K time when recomputing capacity from activities", async () => {
    activities.push({
      userId: "user-1",
      source: "garmin",
      externalId: "a1",
      sport: "running",
      start: "2026-10-03T07:00:00Z",
      localDate: "2026-10-03",
      durationSec: 5291,
      distanceM: 15_080,
      fetchedAt: "2026-10-03T08:00:00Z",
    });

    const service = new BaselineService(mockMongo);
    const input = baselineInput("garmin");
    // Stima 5K che l'atleta legge su Garmin Connect: non è ricavabile dalle
    // attività, quindi il ricalcolo non deve sovrascriverla.
    input.profile.capacity.recent5kSec = 1500;
    input.profile.capacity.recent5kSource = "declared";

    const saved = await service.save("user-1", input);

    expect(saved.profile.capacity.recent5kSec).toBe(1500);
    expect(saved.profile.capacity.recent5kSource).toBe("declared");
    // Il resto della capacità resta misurato, non dichiarato.
    expect(saved.profile.capacity.asOf).toBeTruthy();
  });

  it("infers the goal type from the description and normalizes availability", async () => {
    const service = new BaselineService(mockMongo);
    const input = baselineInput("manual");
    input.goals.primary.description = "Completare un 5k in meno di 23 minuti";
    input.goals.primary.type = "health";
    input.availability.daysPerWeek = 4;
    input.availability.longSession = { when: "weekend", day: null };
    input.availability.days = [];

    const saved = await service.save("user-1", input);

    // Il tipo non è chiesto all'atleta: viene dedotto dalla descrizione.
    expect(saved.goals.primary.type).toBe("performance");
    // I giorni concreti sono derivati dai controlli giorni/settimana + lunga.
    expect(saved.availability.daysPerWeek).toBe(4);
    expect(saved.availability.days).toHaveLength(4);
    expect(saved.availability.days.some((day) => day.maxDurationMin === 120)).toBe(true);
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
