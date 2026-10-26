import type { DailyMetrics } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

export async function upsertDailyMetrics(db: Db, metrics: DailyMetrics[]): Promise<number> {
  if (metrics.length === 0) return 0;

  const result = await db.collection<DailyMetrics>(COLLECTIONS.dailyMetrics).bulkWrite(
    metrics.map((entry) => ({
      updateOne: {
        filter: {
          userId: entry.userId,
          date: entry.date,
          source: entry.source,
        },
        update: { $set: entry },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  return result.upsertedCount + result.modifiedCount;
}

export async function getRecentDailyMetrics(
  db: Db,
  userId: string,
  limit = 14,
): Promise<DailyMetrics[]> {
  return db
    .collection<DailyMetrics>(COLLECTIONS.dailyMetrics)
    .find({ userId })
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
}

export async function getRecentDailyMetricsBySource(
  db: Db,
  userId: string,
  source: string,
  limit = 14,
): Promise<DailyMetrics[]> {
  return db
    .collection<DailyMetrics>(COLLECTIONS.dailyMetrics)
    .find({ userId, source })
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
}

export async function countDailyMetrics(db: Db, userId: string): Promise<number> {
  return db.collection<DailyMetrics>(COLLECTIONS.dailyMetrics).countDocuments({ userId });
}

export async function countDailyMetricsBySource(
  db: Db,
  userId: string,
  source: string,
): Promise<number> {
  return db.collection<DailyMetrics>(COLLECTIONS.dailyMetrics).countDocuments({ userId, source });
}
