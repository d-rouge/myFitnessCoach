import type { ActivityAnalysis } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

export async function upsertActivityAnalysis(db: Db, analysis: ActivityAnalysis): Promise<void> {
  await db.collection<ActivityAnalysis>(COLLECTIONS.activityAnalyses).updateOne(
    {
      userId: analysis.userId,
      source: analysis.source,
      externalId: analysis.externalId,
    },
    { $set: analysis },
    { upsert: true },
  );
}

export async function getActivityAnalysis(
  db: Db,
  userId: string,
  source: string,
  externalId: string,
): Promise<ActivityAnalysis | null> {
  return db.collection<ActivityAnalysis>(COLLECTIONS.activityAnalyses).findOne({
    userId,
    source,
    externalId,
  });
}

export async function getRecentActivityAnalyses(
  db: Db,
  userId: string,
  limit = 10,
): Promise<ActivityAnalysis[]> {
  return db
    .collection<ActivityAnalysis>(COLLECTIONS.activityAnalyses)
    .find({ userId })
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
}
