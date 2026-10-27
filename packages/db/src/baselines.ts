import type { Baseline } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";
import { uuidv7 } from "./ids";

export type NewBaseline = Omit<Baseline, "id" | "version" | "validFrom" | "supersededAt">;

export async function getCurrentBaseline(db: Db, userId: string): Promise<Baseline | null> {
  const doc = await db
    .collection<Baseline>(COLLECTIONS.baselines)
    .findOne({ userId, supersededAt: null }, { sort: { version: -1, validFrom: -1 } });

  if (!doc) return null;
  const { _id: _, ...rest } = doc as unknown as { _id?: unknown } & Baseline;
  return rest;
}

export async function saveBaseline(db: Db, input: NewBaseline): Promise<Baseline> {
  const now = new Date().toISOString();
  const collection = db.collection<Baseline>(COLLECTIONS.baselines);
  const current = await getCurrentBaseline(db, input.userId);

  const nextVersion = current ? current.version + 1 : 1;

  // Supersede by active state, never by a client-supplied id.
  await collection.updateMany(
    { userId: input.userId, supersededAt: null },
    { $set: { supersededAt: now } },
  );

  const newBaseline: Baseline = {
    ...input,
    id: `baseline_${uuidv7()}`,
    version: nextVersion,
    validFrom: now,
    supersededAt: null,
  };

  await collection.insertOne(newBaseline);

  return newBaseline;
}

export async function getBaselineHistory(db: Db, userId: string): Promise<Baseline[]> {
  const docs = await db
    .collection<Baseline>(COLLECTIONS.baselines)
    .find({ userId })
    .sort({ version: -1, validFrom: -1 })
    .toArray();

  return docs.map((doc) => {
    const { _id: _, ...rest } = doc as unknown as { _id?: unknown } & Baseline;
    return rest;
  });
}
