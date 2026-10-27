import { COLLECTIONS } from "@health-trainer/db";
import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { GARMIN_PROVIDER, PERSONAL_USER_ID } from "../config/constants.js";
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

    await service.overview(7);

    expect(metricFilters).toEqual([{ userId: PERSONAL_USER_ID, source: GARMIN_PROVIDER }]);
  });
});
