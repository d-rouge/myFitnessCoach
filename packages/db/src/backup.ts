import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";

export interface UserDataBackup {
  userId: string;
  exportedAt: string;
  version: string;
  data: {
    user: unknown;
    baselines: unknown[];
    macroPlans: unknown[];
    microPlans: unknown[];
    checkins: unknown[];
    reviews: unknown[];
    activities: unknown[];
    activityAnalyses: unknown[];
    dailyMetrics: unknown[];
    nutritionDaily: unknown[];
  };
}

export async function exportUserData(db: Db, userId: string): Promise<UserDataBackup> {
  const [
    user,
    baselines,
    macroPlans,
    microPlans,
    checkins,
    reviews,
    activities,
    activityAnalyses,
    dailyMetrics,
    nutritionDaily,
  ] = await Promise.all([
    db.collection(COLLECTIONS.users).findOne({ id: userId }),
    db.collection(COLLECTIONS.baselines).find({ userId }).toArray(),
    db.collection(COLLECTIONS.macroPlans).find({ userId }).toArray(),
    db.collection(COLLECTIONS.microPlans).find({ userId }).toArray(),
    db.collection(COLLECTIONS.checkins).find({ userId }).toArray(),
    db.collection(COLLECTIONS.reviews).find({ userId }).toArray(),
    db.collection(COLLECTIONS.activities).find({ userId }).toArray(),
    db.collection(COLLECTIONS.activityAnalyses).find({ userId }).toArray(),
    db.collection(COLLECTIONS.dailyMetrics).find({ userId }).toArray(),
    db.collection(COLLECTIONS.nutritionDaily).find({ userId }).toArray(),
  ]);

  return {
    userId,
    exportedAt: new Date().toISOString(),
    version: "0.2.0",
    data: {
      user,
      baselines,
      macroPlans,
      microPlans,
      checkins,
      reviews,
      activities,
      activityAnalyses,
      dailyMetrics,
      nutritionDaily,
    },
  };
}

export async function deleteUserData(
  db: Db,
  userId: string,
): Promise<{ deletedCollections: string[] }> {
  const collectionsToClean = [
    COLLECTIONS.baselines,
    COLLECTIONS.macroPlans,
    COLLECTIONS.microPlans,
    COLLECTIONS.checkins,
    COLLECTIONS.reviews,
    COLLECTIONS.activities,
    COLLECTIONS.activityAnalyses,
    COLLECTIONS.dailyMetrics,
    COLLECTIONS.nutritionDaily,
    COLLECTIONS.syncRuns,
    COLLECTIONS.syncState,
  ];

  await Promise.all(collectionsToClean.map((coll) => db.collection(coll).deleteMany({ userId })));

  return { deletedCollections: collectionsToClean };
}

export async function restoreUserData(
  db: Db,
  backup: UserDataBackup,
): Promise<{ restoredCount: number }> {
  let count = 0;
  const d = backup.data;

  if (d.baselines && d.baselines.length > 0) {
    await db.collection(COLLECTIONS.baselines).insertMany(d.baselines as never[]);
    count += d.baselines.length;
  }
  if (d.macroPlans && d.macroPlans.length > 0) {
    await db.collection(COLLECTIONS.macroPlans).insertMany(d.macroPlans as never[]);
    count += d.macroPlans.length;
  }
  if (d.microPlans && d.microPlans.length > 0) {
    await db.collection(COLLECTIONS.microPlans).insertMany(d.microPlans as never[]);
    count += d.microPlans.length;
  }
  if (d.checkins && d.checkins.length > 0) {
    await db.collection(COLLECTIONS.checkins).insertMany(d.checkins as never[]);
    count += d.checkins.length;
  }
  if (d.reviews && d.reviews.length > 0) {
    await db.collection(COLLECTIONS.reviews).insertMany(d.reviews as never[]);
    count += d.reviews.length;
  }
  if (d.activities && d.activities.length > 0) {
    await db.collection(COLLECTIONS.activities).insertMany(d.activities as never[]);
    count += d.activities.length;
  }

  return { restoredCount: count };
}
