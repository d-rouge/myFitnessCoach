import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { deleteUserData, exportUserData, restoreUserData, type UserDataBackup } from "./backup";
import { COLLECTIONS } from "./collections";

type Doc = Record<string, unknown>;

/** In-memory stand-in for the few Mongo calls the backup module makes. */
function memoryDb(seed: Record<string, Doc[]> = {}) {
  const store: Record<string, Doc[]> = structuredClone(seed);
  const docs = (name: string) => {
    store[name] ??= [];
    return store[name];
  };
  const matches = (doc: Doc, filter: Doc) =>
    Object.entries(filter).every(([key, value]) => doc[key] === value);

  const db = {
    collection: (name: string) => ({
      find: (filter: Doc) => ({
        toArray: async () => docs(name).filter((d) => matches(d, filter)),
      }),
      findOne: async (filter: Doc) => docs(name).find((d) => matches(d, filter)) ?? null,
      deleteMany: async (filter: Doc) => {
        store[name] = docs(name).filter((d) => !matches(d, filter));
      },
      deleteOne: async (filter: Doc) => {
        const index = docs(name).findIndex((d) => matches(d, filter));
        if (index >= 0) docs(name).splice(index, 1);
      },
      insertMany: async (items: Doc[]) => {
        docs(name).push(...items);
      },
      insertOne: async (item: Doc) => {
        docs(name).push(item);
      },
    }),
  } as unknown as Db;

  return { db, store };
}

const userId = "user_a";

const seeded = {
  [COLLECTIONS.users]: [{ id: userId, email: "a@example.com" }],
  [COLLECTIONS.methodologyDecisions]: [
    { id: "methodology_1", userId, decision: { methodology: "Piramidale" } },
    { id: "methodology_other", userId: "user_b", decision: { methodology: "Polarizzata" } },
  ],
  [COLLECTIONS.planInterviews]: [
    { id: "interview_1", userId, messages: [{ role: "user", content: "ginocchio" }] },
  ],
};

describe("user data backup", () => {
  it("exports the methodology decisions and interviews of the user only", async () => {
    const { db } = memoryDb(seeded);
    const backup = await exportUserData(db, userId);

    expect(backup.version).toBe("0.4.0");
    expect(backup.data.methodologyDecisions).toEqual([seeded[COLLECTIONS.methodologyDecisions][0]]);
    expect(backup.data.planInterviews).toEqual(seeded[COLLECTIONS.planInterviews]);
  });

  it("wipes every user-partitioned collection, interviews included", async () => {
    const { db, store } = memoryDb(seeded);
    const { deletedCollections } = await deleteUserData(db, userId);

    // A new collection must be added to the wipe, or this fails.
    expect([...deletedCollections].sort()).toEqual(Object.values(COLLECTIONS).sort());
    expect(store[COLLECTIONS.planInterviews]).toEqual([]);
    expect(store[COLLECTIONS.methodologyDecisions]).toEqual([
      seeded[COLLECTIONS.methodologyDecisions][1],
    ]);
  });

  it("restores interviews and methodology decisions for the caller", async () => {
    const { db: source } = memoryDb(seeded);
    const backup = await exportUserData(source, userId);
    const { db, store } = memoryDb();

    await restoreUserData(db, backup, "user_restored");

    expect(store[COLLECTIONS.planInterviews]).toEqual([
      { ...seeded[COLLECTIONS.planInterviews][0], userId: "user_restored" },
    ]);
    expect(store[COLLECTIONS.methodologyDecisions]).toHaveLength(1);
  });

  it("still restores a 0.3.0 backup without the new collections", async () => {
    const { db, store } = memoryDb();
    const legacy: UserDataBackup = {
      userId,
      exportedAt: "2026-10-27T10:00:00.000Z",
      version: "0.3.0",
      data: {
        user: { id: userId },
        baselines: [{ id: "baseline_1", userId }],
        macroPlans: [],
        microPlans: [],
        checkins: [],
        reviews: [],
        activities: [],
        activityAnalyses: [],
        dailyMetrics: [],
        nutritionDaily: [],
        aiRuns: [],
      },
    };

    const { restoredCount } = await restoreUserData(db, legacy, userId);

    expect(restoredCount).toBe(1);
    expect(store[COLLECTIONS.planInterviews] ?? []).toEqual([]);
  });
});
