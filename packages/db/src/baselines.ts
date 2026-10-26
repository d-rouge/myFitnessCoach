import type { Baseline } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

export async function getCurrentBaseline(db: Db, userId: string): Promise<Baseline | null> {
  const doc = await db
    .collection<Baseline>(COLLECTIONS.baselines)
    .findOne({ userId, supersededAt: null });

  if (!doc) return null;
  const { _id: _, ...rest } = doc as unknown as { _id?: unknown } & Baseline;
  return rest;
}

export async function saveBaseline(
  db: Db,
  input: Omit<Baseline, "version" | "validFrom" | "supersededAt">,
): Promise<Baseline> {
  const now = new Date().toISOString();
  const current = await getCurrentBaseline(db, input.userId);

  const nextVersion = current ? current.version + 1 : 1;

  if (current) {
    await db
      .collection<Baseline>(COLLECTIONS.baselines)
      .updateOne({ id: current.id }, { $set: { supersededAt: now } });
  }

  const newBaseline: Baseline = {
    ...input,
    version: nextVersion,
    validFrom: now,
    supersededAt: null,
  };

  await db.collection<Baseline>(COLLECTIONS.baselines).insertOne(newBaseline);

  return newBaseline;
}

export async function getBaselineHistory(db: Db, userId: string): Promise<Baseline[]> {
  const docs = await db
    .collection<Baseline>(COLLECTIONS.baselines)
    .find({ userId })
    .sort({ version: -1 })
    .toArray();

  return docs.map((doc) => {
    const { _id: _, ...rest } = doc as unknown as { _id?: unknown } & Baseline;
    return rest;
  });
}
