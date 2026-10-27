import type { Activity } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

export async function upsertActivities(db: Db, activities: Activity[]): Promise<number> {
  if (activities.length === 0) return 0;

  const result = await db.collection<Activity>(COLLECTIONS.activities).bulkWrite(
    activities.map((activity) => ({
      updateOne: {
        filter: {
          userId: activity.userId,
          source: activity.source,
          externalId: activity.externalId,
        },
        update: { $set: activity },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  return result.upsertedCount + result.modifiedCount;
}

export async function getRecentActivities(db: Db, userId: string, limit = 10): Promise<Activity[]> {
  return db
    .collection<Activity>(COLLECTIONS.activities)
    .find({ userId })
    .sort({ start: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Activities used to estimate current capacity. Sorted newest first and
 * bounded: capacity only looks at the last ~3 months plus the consistency
 * streak, so a large limit is enough without a date index.
 */
export async function getActivitiesForCapacity(
  db: Db,
  userId: string,
  limit = 400,
): Promise<Activity[]> {
  return db
    .collection<Activity>(COLLECTIONS.activities)
    .find({ userId })
    .sort({ start: -1 })
    .limit(limit)
    .toArray();
}

export async function getActivityByExternalId(
  db: Db,
  userId: string,
  source: string,
  externalId: string,
): Promise<Activity | null> {
  return db.collection<Activity>(COLLECTIONS.activities).findOne({
    userId,
    source,
    externalId,
  });
}

export async function countActivities(db: Db, userId: string): Promise<number> {
  return db.collection<Activity>(COLLECTIONS.activities).countDocuments({ userId });
}
