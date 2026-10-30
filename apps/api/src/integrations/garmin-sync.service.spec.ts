import { COLLECTIONS } from "@health-trainer/db";
import { dayIndex } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { GARMIN_PROVIDER } from "../config/constants.js";
import type { MongoService } from "../database/mongo.service.js";
import type { GarminService } from "./garmin.service.js";
import { GarminSyncService } from "./garmin-sync.service.js";

describe("GarminSyncService overview", () => {
  it("reads daily metrics only from the Garmin source", async () => {
    const metricFilters: Record<string, unknown>[] = [];
    const emptyPage = {
      sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
    };

    const db = {
      collection: (name: string) => {
        if (name === COLLECTIONS.dailyMetrics) {
          return {
            find: (filter: Record<string, unknown>) => {
              metricFilters.push(filter);
              return emptyPage;
            },
            countDocuments: async () => 0,
          };
        }
        if (name === COLLECTIONS.activities) {
          return { find: () => emptyPage, countDocuments: async () => 0 };
        }
        return { findOne: async () => null };
      },
    } as unknown as Db;

    const service = new GarminSyncService(
      { isConfigured: () => true } as unknown as GarminService,
      { getDb: async () => db } as unknown as MongoService,
    );

    await service.overview("usr_authenticated", 7);

    expect(metricFilters).toEqual([{ userId: "usr_authenticated", source: GARMIN_PROVIDER }]);
  });
});

describe("GarminSyncService activity summary", () => {
  it("counts only Garmin activities and returns sport totals and the included entries", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const storedActivities = [
      {
        userId: "usr_authenticated",
        source: GARMIN_PROVIDER,
        externalId: "run-1",
        localDate: today,
        sport: "running" as const,
        durationSec: 3600,
        title: "Morning run",
      },
      {
        userId: "usr_authenticated",
        source: GARMIN_PROVIDER,
        externalId: "ride-1",
        localDate: today,
        sport: "cycling" as const,
        durationSec: 5400,
        title: "Evening ride",
      },
      {
        userId: "usr_authenticated",
        source: "manual",
        externalId: "manual-1",
        localDate: today,
        sport: "running" as const,
        durationSec: 7200,
        title: "Manual activity",
      },
    ];
    let activityFilter: Record<string, unknown> | undefined;
    const db = {
      collection: (name: string) => {
        if (name === COLLECTIONS.baselines) return { findOne: async () => null };
        if (name === COLLECTIONS.activities) {
          return {
            find: (filter: Record<string, unknown>) => {
              activityFilter = filter;
              return {
                sort: () => ({
                  toArray: async () =>
                    storedActivities.filter(
                      (activity) =>
                        activity.source === filter.source && activity.userId === filter.userId,
                    ),
                }),
              };
            },
          };
        }
        return {};
      },
    } as unknown as Db;
    const service = new GarminSyncService(
      {} as GarminService,
      { getDb: async () => db } as unknown as MongoService,
    );

    const summary = await service.activitySummary("usr_authenticated", 90);

    expect(activityFilter).toMatchObject({
      userId: "usr_authenticated",
      source: GARMIN_PROVIDER,
    });
    expect(summary.totalActivities).toBe(2);
    expect(summary.durationSeconds).toBe(9000);
    expect(summary.bySport).toEqual([
      { sport: "cycling", activities: 1, durationSeconds: 5400 },
      { sport: "running", activities: 1, durationSeconds: 3600 },
    ]);
    expect(summary.entries.map((entry) => entry.id)).toEqual(["run-1", "ride-1"]);
  });
});

describe("GarminSyncService sync", () => {
  it("imports all activity pages from 90 days while limiting wellness metrics to 30 days", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const activityRows = Array.from({ length: 101 }, (_value, index) => ({
      activityId: String(index + 1),
      activityType: { typeKey: "running" },
      startTimeLocal: `${today}T07:00:00`,
      startTimeGMT: `${today}T07:00:00.000Z`,
      duration: 1800,
      distance: 5000,
    }));
    const searchCalls: Array<{
      start?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
    }> = [];
    const summaryRanges: Array<{ from: string; to: string }> = [];
    const client = {
      searchActivities: async (params: (typeof searchCalls)[number]) => {
        searchCalls.push(params);
        return activityRows.slice(params.start ?? 0, (params.start ?? 0) + (params.limit ?? 100));
      },
      getDailySummaries: async (from: string, to: string) => {
        summaryRanges.push({ from, to });
        return [];
      },
      getBodyBattery: async () => [],
      getWeightMeasurements: async () => [],
      getDailySleep: async () => undefined,
      getHrv: async () => undefined,
      getDailyHeartRate: async () => undefined,
      getSpo2: async () => undefined,
    };

    const db = {
      collection: (name: string) => {
        if (name === COLLECTIONS.baselines) return { findOne: async () => null };
        if (name === COLLECTIONS.activities) {
          return {
            bulkWrite: async (operations: unknown[]) => ({
              upsertedCount: operations.length,
              modifiedCount: 0,
            }),
          };
        }
        if (name === COLLECTIONS.syncRuns || name === COLLECTIONS.syncState) {
          return {
            insertOne: async () => undefined,
            updateOne: async () => undefined,
          };
        }
        return { bulkWrite: async () => ({ upsertedCount: 0, modifiedCount: 0 }) };
      },
    } as unknown as Db;

    const service = new GarminSyncService(
      { getClient: () => client } as unknown as GarminService,
      { getDb: async () => db } as unknown as MongoService,
    );

    const result = await service.sync("usr_authenticated", 90);

    expect(result.days).toBe(90);
    expect(result.activities).toBe(101);
    expect(searchCalls.map((call) => call.start)).toEqual([0, 100]);
    expect(searchCalls[0]?.startDate).toBe(result.from);
    expect(dayIndex(result.to) - dayIndex(result.from) + 1).toBe(90);
    expect(summaryRanges).toHaveLength(1);
    const summaryRange = summaryRanges[0];
    if (!summaryRange) throw new Error("Expected one wellness metrics request");
    expect(dayIndex(summaryRange.to) - dayIndex(summaryRange.from) + 1).toBe(30);
  });
});
