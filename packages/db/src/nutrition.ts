import type { NutritionDaily } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

export async function upsertNutrition(db: Db, entries: NutritionDaily[]): Promise<number> {
  if (entries.length === 0) return 0;

  const result = await db.collection<NutritionDaily>(COLLECTIONS.nutritionDaily).bulkWrite(
    entries.map((entry) => ({
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

export async function getRecentNutrition(
  db: Db,
  userId: string,
  limit = 14,
): Promise<NutritionDaily[]> {
  return db
    .collection<NutritionDaily>(COLLECTIONS.nutritionDaily)
    .find({ userId })
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
}

export async function countNutrition(db: Db, userId: string): Promise<number> {
  return db.collection<NutritionDaily>(COLLECTIONS.nutritionDaily).countDocuments({ userId });
}
