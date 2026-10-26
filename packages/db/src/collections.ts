import type { Db } from "mongodb";

export const COLLECTIONS = {
  activities: "activities",
  activityAnalyses: "activity_analyses",
  baselines: "athlete_baselines",
  macroPlans: "athlete_macro_plans",
  microPlans: "athlete_micro_plans",
  dailyMetrics: "metrics_daily",
  nutritionDaily: "nutrition_daily",
  syncRuns: "sync_runs",
  syncState: "sync_state",
  users: "users",
} as const;

export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection(COLLECTIONS.users).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.users).createIndex({ email: 1 }, { unique: true }),
    db.collection(COLLECTIONS.baselines).createIndex({ userId: 1, version: -1 }),
    db.collection(COLLECTIONS.baselines).createIndex({ userId: 1, supersededAt: 1 }),
    db.collection(COLLECTIONS.macroPlans).createIndex({ userId: 1, id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.macroPlans).createIndex({ userId: 1, startDate: -1 }),
    db
      .collection(COLLECTIONS.microPlans)
      .createIndex({ userId: 1, macroPlanId: 1, weekIndex: 1 }, { unique: true }),
    db.collection(COLLECTIONS.microPlans).createIndex({ userId: 1, startDate: -1 }),
    db
      .collection(COLLECTIONS.activities)
      .createIndex({ userId: 1, source: 1, externalId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.activities).createIndex({ userId: 1, start: -1 }),
    db
      .collection(COLLECTIONS.activityAnalyses)
      .createIndex({ userId: 1, source: 1, externalId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.activityAnalyses).createIndex({ userId: 1, date: -1 }),
    db
      .collection(COLLECTIONS.dailyMetrics)
      .createIndex({ userId: 1, date: 1, source: 1 }, { unique: true }),
    db.collection(COLLECTIONS.dailyMetrics).createIndex({ userId: 1, date: -1 }),
    db
      .collection(COLLECTIONS.nutritionDaily)
      .createIndex({ userId: 1, date: 1, source: 1 }, { unique: true }),
    db.collection(COLLECTIONS.nutritionDaily).createIndex({ userId: 1, date: -1 }),
    db.collection(COLLECTIONS.syncRuns).createIndex({ userId: 1, provider: 1, startedAt: -1 }),
    db.collection(COLLECTIONS.syncState).createIndex({ userId: 1, provider: 1 }, { unique: true }),
  ]);
}
