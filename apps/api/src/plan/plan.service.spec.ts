import { type Baseline, beginnerPersona } from "@health-trainer/domain";
import { describe, expect, it, vi } from "vitest";
import { AthleteService } from "../athlete/athlete.service.js";
import type { MongoService } from "../database/mongo.service.js";
import type { MethodologyService } from "./methodology.service.js";
import { PlanService } from "./plan.service.js";

function planService(mongo: MongoService): PlanService {
  const methodology = {
    latest: async () => null,
  } as unknown as MethodologyService;
  return new PlanService(mongo, new AthleteService(mongo), methodology);
}

function mongoWithBaseline(baseline: Baseline): MongoService {
  return {
    getDb: async () => ({
      collection: () => ({
        findOne: async (query: { userId?: string }) =>
          query.userId === baseline.userId ? baseline : null,
        find: (query: { userId?: string }) => ({
          sort: () => ({
            // getCheckinsInRange usa .sort().toArray() senza limit()
            toArray: async () => [],
            limit: () => ({
              next: async () => (query.userId === baseline.userId ? baseline : null),
              toArray: async () => [],
            }),
          }),
        }),
      }),
    }),
  } as unknown as MongoService;
}

describe("PlanService", () => {
  it("throws BadRequestException when generating plan without baseline", async () => {
    const mockMongo = {
      getDb: async () => ({
        collection: () => ({
          findOne: async () => null,
          find: () => ({
            sort: () => ({
              toArray: async () => [],
              limit: () => ({
                next: async () => null,
                toArray: async () => [],
              }),
            }),
          }),
        }),
      }),
    } as unknown as MongoService;

    const service = planService(mockMongo);
    await expect(service.generateMacroPlan("user_none")).rejects.toThrow(/Nessuna baseline attiva/);
  });

  it("returns rest day when no microplan exists", async () => {
    const mockMongo = {
      getDb: async () => ({
        collection: () => ({
          findOne: async () => null,
          find: () => ({
            sort: () => ({
              toArray: async () => [],
              limit: () => ({
                next: async () => null,
                toArray: async () => [],
              }),
            }),
          }),
        }),
      }),
    } as unknown as MongoService;

    const service = planService(mockMongo);
    const today = await service.getTodaySession("user_1");

    expect(today.isRestDay).toBe(true);
    expect(today.session).toBeNull();
    expect(today.alternatives).toHaveLength(0);
  });

  it("computes today in the athlete timezone, not in UTC", async () => {
    const baseline: Baseline = {
      ...beginnerPersona,
      profile: { ...beginnerPersona.profile, timezone: "Europe/Rome" },
    };

    const mockMongo = {
      getDb: async () => ({
        collection: (name: string) => ({
          findOne: async (query: { userId?: string }) =>
            name === "athlete_baselines" && query.userId === baseline.userId ? baseline : null,
          find: () => ({
            sort: () => ({
              toArray: async () => [],
              limit: () => ({
                next: async () => null,
                toArray: async () => [],
              }),
            }),
          }),
        }),
      }),
    } as unknown as MongoService;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T23:30:00Z"));
    try {
      const service = planService(mockMongo);
      const today = await service.getTodaySession(baseline.userId);

      expect(today.timeZone).toBe("Europe/Rome");
      expect(today.today).toBe("2026-10-28");
    } finally {
      vi.useRealTimers();
    }
  });

  it("generates macro plan and week 1 micro plan when baseline exists", async () => {
    interface DocWithUserId {
      userId?: string;
      [key: string]: unknown;
    }

    const memoryDocs: Record<string, DocWithUserId[]> = {
      athlete_baselines: [beginnerPersona],
      athlete_macro_plans: [],
      athlete_micro_plans: [],
    };

    const mockMongo = {
      getDb: async () => ({
        collection: (name: string) => ({
          findOne: async (query: { userId?: string }) =>
            memoryDocs[name]?.find((doc) => doc.userId === query.userId) ?? null,
          find: (query: { userId?: string }) => ({
            sort: () => ({
              toArray: async () => [],
              limit: () => ({
                next: async () =>
                  memoryDocs[name]?.find((doc) => doc.userId === query.userId) ?? null,
                toArray: async () =>
                  memoryDocs[name]?.filter((doc) => doc.userId === query.userId) ?? [],
              }),
            }),
          }),
          updateOne: async (_filter: unknown, update: { $set: DocWithUserId }) => {
            memoryDocs[name]?.push(update.$set);
            return { modifiedCount: 1, upsertedCount: 1 };
          },
          deleteMany: async (filter: {
            userId?: string;
            id?: { $ne?: string };
            macroPlanId?: { $ne?: string };
          }) => {
            const before = memoryDocs[name]?.length ?? 0;
            const field = filter.id !== undefined ? "id" : "macroPlanId";
            const keep = filter.id?.$ne ?? filter.macroPlanId?.$ne;
            const kept = (memoryDocs[name] ?? []).filter((doc) =>
              doc.userId === filter.userId && keep !== undefined
                ? doc[field] === keep
                : doc.userId !== filter.userId,
            );
            memoryDocs[name] = kept;
            return { deletedCount: before - kept.length };
          },
        }),
      }),
    } as unknown as MongoService;

    const service = planService(mockMongo);
    const result = await service.generateMacroPlan(beginnerPersona.userId, {
      startDate: "2026-11-02",
      totalWeeks: 8,
    });

    // Regenerating must not leave two plans with the same start date, which
    // would make `getCurrentMacroPlan` non-deterministic.
    await service.generateMacroPlan(beginnerPersona.userId, {
      startDate: "2026-11-03",
      totalWeeks: 8,
    });
    expect(memoryDocs.athlete_macro_plans?.length).toBe(1);
    expect(memoryDocs.athlete_micro_plans?.length).toBe(1);

    expect(result.macroPlan.totalWeeks).toBe(8);
    expect(result.microPlan.weekIndex).toBe(1);
    expect(result.microPlan.sessions.length).toBe(beginnerPersona.availability.days.length);
    expect(memoryDocs.athlete_macro_plans.length).toBeGreaterThan(0);
    expect(memoryDocs.athlete_micro_plans.length).toBeGreaterThan(0);
  });

  it("blocks plan generation when absolute red flags are declared", async () => {
    const unsafe: Baseline = {
      ...beginnerPersona,
      anamnesis: {
        ...beginnerPersona.anamnesis,
        redFlags: ["dolore toracico"],
        parqCleared: true,
      },
    };

    const service = planService(mongoWithBaseline(unsafe));

    await expect(service.generateMacroPlan(unsafe.userId)).rejects.toThrow(/sicurezza/i);
    await expect(service.generateMacroPlan(unsafe.userId)).rejects.toThrow(/dolore toracico/i);
  });

  it("blocks plan generation when PAR-Q clearance is missing", async () => {
    const unclear: Baseline = {
      ...beginnerPersona,
      anamnesis: {
        ...beginnerPersona.anamnesis,
        redFlags: [],
        parqCleared: false,
      },
    };

    const service = planService(mongoWithBaseline(unclear));

    await expect(service.generateMacroPlan(unclear.userId)).rejects.toThrow(/PAR-Q/i);
  });

  it("generates from a legacy baseline, refreshing capacity and forcing post-race recovery", async () => {
    const userId = "user_legacy";
    // Shape of a document saved before the v2 model: no history, no capacity.
    const legacy = {
      ...beginnerPersona,
      userId,
      anamnesis: { ...beginnerPersona.anamnesis, freeText: "" },
      profile: {
        birthDate: "1992-05-14",
        sex: beginnerPersona.profile.sex,
        heightCm: 178,
        weightKg: 78,
        sports: ["running"],
        timezone: "Europe/Rome",
        tone: beginnerPersona.profile.tone,
        units: "metric",
      },
    };

    const activities = [
      {
        userId,
        source: "garmin",
        sport: "running",
        start: "2026-10-25T07:00:00Z",
        localDate: "2026-10-25",
        durationSec: 17_490,
        distanceM: 42_641,
        title: "Maratona",
      },
    ];

    const mockMongo = {
      getDb: async () => ({
        collection: (name: string) => ({
          findOne: async (query: { userId?: string }) =>
            name === "athlete_baselines" && query.userId === userId ? legacy : null,
          find: (query: { userId?: string }) => ({
            sort: () => ({
              toArray: async () => [],
              limit: () => ({
                next: async () => null,
                toArray: async () =>
                  name === "activities" ? activities.filter((a) => a.userId === query.userId) : [],
              }),
            }),
          }),
          updateOne: async () => ({ modifiedCount: 1, upsertedCount: 1 }),
          deleteMany: async () => ({ deletedCount: 0 }),
        }),
      }),
    } as unknown as MongoService;

    const service = planService(mockMongo);
    const result = await service.generateMacroPlan(userId, { startDate: "2026-10-27" });

    // The dictionary created by `experience: "beginner"` is not trusted: the
    // measured capacity replaces it, then the marathon guard applies.
    expect(result.macroPlan.recoveryWindow?.weeks).toBe(3);
    expect(result.macroPlan.flags).toContain("post_race_recovery");
    expect(result.microPlan.sessions.every((s) => (s.intensity.rpe ?? 0) <= 6)).toBe(true);
  });
});
