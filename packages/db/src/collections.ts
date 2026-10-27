import type { Db, ObjectId } from "mongodb";

export const COLLECTIONS = {
  activities: "activities",
  activityAnalyses: "activity_analyses",
  aiRuns: "ai_runs",
  baselines: "athlete_baselines",
  checkins: "checkins",
  credentials: "auth_credentials",
  macroPlans: "athlete_macro_plans",
  microPlans: "athlete_micro_plans",
  dailyMetrics: "metrics_daily",
  nutritionDaily: "nutrition_daily",
  reviews: "weekly_reviews",
  syncRuns: "sync_runs",
  syncState: "sync_state",
  users: "users",
} as const;

async function ensureActiveBaselineIndex(db: Db): Promise<void> {
  const collection = db.collection(COLLECTIONS.baselines);
  const options = {
    unique: true,
    partialFilterExpression: { supersededAt: null },
    name: "uniq_active_baseline_per_user",
  };

  try {
    await collection.createIndex({ userId: 1 }, options);
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;

    // Legacy data can contain several active baselines per user. Keep the
    // newest one and supersede the rest before retrying the unique index.
    const now = new Date().toISOString();
    const actives = await collection
      .find({ supersededAt: null })
      .sort({ userId: 1, version: -1, validFrom: -1 })
      .toArray();

    let previousUserId: string | null = null;
    for (const doc of actives) {
      const userId = (doc as unknown as { userId?: string }).userId ?? "";
      if (userId === previousUserId) {
        await collection.updateOne(
          { _id: (doc as unknown as { _id: ObjectId })._id },
          { $set: { supersededAt: now } },
        );
      } else {
        previousUserId = userId;
      }
    }

    await collection.createIndex({ userId: 1 }, options);
  }
}

export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection(COLLECTIONS.users).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.users).createIndex({ email: 1 }, { unique: true }),
    db.collection(COLLECTIONS.credentials).createIndex({ userId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.credentials).createIndex({ email: 1 }, { unique: true }),
    db.collection(COLLECTIONS.baselines).createIndex({ userId: 1, version: -1 }),
    ensureActiveBaselineIndex(db),
    db
      .collection(COLLECTIONS.checkins)
      .createIndex({ userId: 1, date: 1, type: 1 }, { unique: true }),
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
    db.collection(COLLECTIONS.reviews).createIndex({ userId: 1, startDate: -1 }),
    db.collection(COLLECTIONS.aiRuns).createIndex({ userId: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.syncRuns).createIndex({ userId: 1, provider: 1, startedAt: -1 }),
    db.collection(COLLECTIONS.syncState).createIndex({ userId: 1, provider: 1 }, { unique: true }),
  ]);
}
