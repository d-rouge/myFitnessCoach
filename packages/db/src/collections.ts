import type { Db } from "mongodb";

export const COLLECTIONS = {
  activities: "activities",
  dailyMetrics: "metrics_daily",
  syncRuns: "sync_runs",
  syncState: "sync_state",
} as const;

export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db
      .collection(COLLECTIONS.activities)
      .createIndex({ userId: 1, source: 1, externalId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.activities).createIndex({ userId: 1, start: -1 }),
    db
      .collection(COLLECTIONS.dailyMetrics)
      .createIndex({ userId: 1, date: 1, source: 1 }, { unique: true }),
    db.collection(COLLECTIONS.dailyMetrics).createIndex({ userId: 1, date: -1 }),
    db.collection(COLLECTIONS.syncRuns).createIndex({ userId: 1, provider: 1, startedAt: -1 }),
    db.collection(COLLECTIONS.syncState).createIndex({ userId: 1, provider: 1 }, { unique: true }),
  ]);
}
