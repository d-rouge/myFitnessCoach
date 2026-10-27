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
    aiRuns: unknown[];
  };
}

const USER_COLLECTIONS = [
  COLLECTIONS.baselines,
  COLLECTIONS.macroPlans,
  COLLECTIONS.microPlans,
  COLLECTIONS.checkins,
  COLLECTIONS.reviews,
  COLLECTIONS.activities,
  COLLECTIONS.activityAnalyses,
  COLLECTIONS.dailyMetrics,
  COLLECTIONS.nutritionDaily,
  COLLECTIONS.aiRuns,
  COLLECTIONS.syncRuns,
  COLLECTIONS.syncState,
  COLLECTIONS.credentials,
] as const;

const RESTORE_COLLECTIONS = [
  COLLECTIONS.baselines,
  COLLECTIONS.macroPlans,
  COLLECTIONS.microPlans,
  COLLECTIONS.checkins,
  COLLECTIONS.reviews,
  COLLECTIONS.activities,
  COLLECTIONS.activityAnalyses,
  COLLECTIONS.dailyMetrics,
  COLLECTIONS.nutritionDaily,
  COLLECTIONS.aiRuns,
] as const;

type RestoreKey = (typeof RESTORE_COLLECTIONS)[number];

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
    aiRuns,
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
    db.collection(COLLECTIONS.aiRuns).find({ userId }).toArray(),
  ]);

  return {
    userId,
    exportedAt: new Date().toISOString(),
    version: "0.3.0",
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
      aiRuns,
    },
  };
}

export async function deleteUserData(
  db: Db,
  userId: string,
): Promise<{ deletedCollections: string[] }> {
  await Promise.all(
    USER_COLLECTIONS.map((collection) => db.collection(collection).deleteMany({ userId })),
  );
  // The user document is keyed by `id`, not `userId`.
  await db.collection(COLLECTIONS.users).deleteOne({ id: userId });

  return { deletedCollections: [...USER_COLLECTIONS, COLLECTIONS.users] };
}

function stripMongoId(doc: unknown): Record<string, unknown> {
  if (!doc || typeof doc !== "object") return {};
  const { _id: _, ...rest } = doc as Record<string, unknown>;
  return rest;
}

function keyFor(collection: RestoreKey, doc: Record<string, unknown>): Record<string, unknown> {
  switch (collection) {
    case COLLECTIONS.microPlans:
      return { macroPlanId: doc.macroPlanId, weekIndex: doc.weekIndex };
    case COLLECTIONS.checkins:
      return { date: doc.date, type: doc.type };
    case COLLECTIONS.dailyMetrics:
    case COLLECTIONS.nutritionDaily:
      return { date: doc.date, source: doc.source };
    case COLLECTIONS.activities:
    case COLLECTIONS.activityAnalyses:
      return { source: doc.source, externalId: doc.externalId };
    default:
      return { id: doc.id };
  }
}

function docsFor(backup: UserDataBackup, collection: RestoreKey): unknown[] {
  switch (collection) {
    case COLLECTIONS.baselines:
      return backup.data.baselines ?? [];
    case COLLECTIONS.macroPlans:
      return backup.data.macroPlans ?? [];
    case COLLECTIONS.microPlans:
      return backup.data.microPlans ?? [];
    case COLLECTIONS.checkins:
      return backup.data.checkins ?? [];
    case COLLECTIONS.reviews:
      return backup.data.reviews ?? [];
    case COLLECTIONS.activities:
      return backup.data.activities ?? [];
    case COLLECTIONS.activityAnalyses:
      return backup.data.activityAnalyses ?? [];
    case COLLECTIONS.dailyMetrics:
      return backup.data.dailyMetrics ?? [];
    case COLLECTIONS.nutritionDaily:
      return backup.data.nutritionDaily ?? [];
    case COLLECTIONS.aiRuns:
      return backup.data.aiRuns ?? [];
  }
}

/**
 * Restores a backup for the authenticated user. The body `userId` is ignored:
 * data always belongs to the caller. The restore is idempotent because each
 * collection is cleared before inserting the backup snapshot.
 */
export async function restoreUserData(
  db: Db,
  backup: UserDataBackup,
  userId: string,
): Promise<{ restoredCount: number }> {
  if (!backup?.data || typeof backup.data !== "object") {
    throw new Error("Payload backup non valido.");
  }

  const prepared = RESTORE_COLLECTIONS.map((collection) => ({
    collection,
    docs: docsFor(backup, collection)
      .map(stripMongoId)
      .map((doc) => ({ ...doc, userId })),
  }));

  // Validate before deleting anything.
  for (const { collection, docs } of prepared) {
    for (const doc of docs) {
      const key = keyFor(collection, doc);
      if (Object.values(key).some((value) => value === undefined || value === null)) {
        throw new Error(`Backup non valido: chiave mancante in ${collection}.`);
      }
    }
  }

  for (const { collection, docs } of prepared) {
    await db.collection(collection).deleteMany({ userId });
    if (docs.length > 0) {
      await db.collection(collection).insertMany(docs as never[]);
    }
  }

  const user = backup.data.user ? stripMongoId(backup.data.user) : null;
  await db.collection(COLLECTIONS.users).deleteOne({ id: userId });
  if (user) {
    await db.collection(COLLECTIONS.users).insertOne({ ...user, id: userId });
  }

  const restoredCount = prepared.reduce((total, { docs }) => total + docs.length, 0);
  return { restoredCount };
}
