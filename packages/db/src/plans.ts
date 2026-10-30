import type { MacroPlan, MicroPlan, PlannedSession } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";

export interface StoredMacroPlan extends MacroPlan {
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMicroPlan extends MicroPlan {
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export async function saveMacroPlan(db: Db, userId: string, plan: MacroPlan): Promise<void> {
  const collection = db.collection<StoredMacroPlan>(COLLECTIONS.macroPlans);
  const now = new Date().toISOString();

  await collection.updateOne(
    { userId, id: plan.id },
    {
      $set: {
        ...plan,
        userId,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

/**
 * Keeps exactly one macro plan per user.
 *
 * `getCurrentMacroPlan` sorts by `startDate`, so two plans generated on the
 * same day are indistinguishable and the older one may win. Plans are derived
 * artifacts (the versioned record is the baseline), so regenerating replaces
 * the previous plan instead of accumulating duplicates.
 */
export async function supersedeMacroPlans(
  db: Db,
  userId: string,
  keepMacroPlanId: string,
): Promise<void> {
  await db
    .collection<StoredMacroPlan>(COLLECTIONS.macroPlans)
    .deleteMany({ userId, id: { $ne: keepMacroPlanId } });
  await db
    .collection<StoredMicroPlan>(COLLECTIONS.microPlans)
    .deleteMany({ userId, macroPlanId: { $ne: keepMacroPlanId } });
}

export async function getCurrentMacroPlan(db: Db, userId: string): Promise<MacroPlan | null> {
  const collection = db.collection<StoredMacroPlan>(COLLECTIONS.macroPlans);
  const doc = await collection.find({ userId }).sort({ startDate: -1 }).limit(1).next();
  if (!doc) return null;

  const {
    _id: _,
    userId: _u,
    createdAt: _c,
    updatedAt: _up,
    ...plan
  } = doc as unknown as StoredMacroPlan & {
    _id: unknown;
  };
  return plan as MacroPlan;
}

/**
 * Ultime settimane pianificate, dalla più recente. Serve al dossier per
 * ricostruire aderenza e storico, non solo la settimana corrente.
 */
export async function getRecentMicroPlans(db: Db, userId: string, limit = 6): Promise<MicroPlan[]> {
  const collection = db.collection<StoredMicroPlan>(COLLECTIONS.microPlans);
  const docs = await collection.find({ userId }).sort({ startDate: -1 }).limit(limit).toArray();

  return docs.map((doc) => {
    const {
      _id: _,
      userId: _u,
      createdAt: _c,
      updatedAt: _up,
      ...plan
    } = doc as unknown as StoredMicroPlan & { _id: unknown };
    return plan as MicroPlan;
  });
}

/**
 * Tutte le settimane del piano corrente, in ordine cronologico.
 *
 * Serve al loop di fattibilità: il piano parte dalla prima seduta completata e
 * può durare più di 6 settimane, quindi un limite sulle settimane recenti
 * perderebbe l'inizio del piano.
 */
export async function getMicroPlansByMacroPlan(
  db: Db,
  userId: string,
  macroPlanId: string,
): Promise<MicroPlan[]> {
  const collection = db.collection<StoredMicroPlan>(COLLECTIONS.microPlans);
  const docs = await collection.find({ userId, macroPlanId }).sort({ weekIndex: 1 }).toArray();

  return docs.map((doc) => {
    const {
      _id: _,
      userId: _u,
      createdAt: _c,
      updatedAt: _up,
      ...plan
    } = doc as unknown as StoredMicroPlan & { _id: unknown };
    return plan as MicroPlan;
  });
}

export async function saveMicroPlan(db: Db, userId: string, plan: MicroPlan): Promise<void> {
  const collection = db.collection<StoredMicroPlan>(COLLECTIONS.microPlans);
  const now = new Date().toISOString();

  await collection.updateOne(
    { userId, macroPlanId: plan.macroPlanId, weekIndex: plan.weekIndex },
    {
      $set: {
        ...plan,
        userId,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

export async function getMicroPlan(
  db: Db,
  userId: string,
  macroPlanId: string,
  weekIndex: number,
): Promise<MicroPlan | null> {
  const collection = db.collection<StoredMicroPlan>(COLLECTIONS.microPlans);
  const doc = await collection.findOne({ userId, macroPlanId, weekIndex });
  if (!doc) return null;

  const {
    _id: _,
    userId: _u,
    createdAt: _c,
    updatedAt: _up,
    ...plan
  } = doc as unknown as StoredMicroPlan & {
    _id: unknown;
  };
  return plan as MicroPlan;
}

export async function getCurrentMicroPlan(
  db: Db,
  userId: string,
  weekIndex?: number,
): Promise<MicroPlan | null> {
  const collection = db.collection<StoredMicroPlan>(COLLECTIONS.microPlans);
  const query: Record<string, unknown> = { userId };
  if (weekIndex !== undefined) {
    query.weekIndex = weekIndex;
  }

  const doc = await collection.find(query).sort({ startDate: -1 }).limit(1).next();
  if (!doc) return null;

  const {
    _id: _,
    userId: _u,
    createdAt: _c,
    updatedAt: _up,
    ...plan
  } = doc as unknown as StoredMicroPlan & {
    _id: unknown;
  };
  return plan as MicroPlan;
}

export async function updatePlannedSession(
  db: Db,
  userId: string,
  sessionId: string,
  patch: {
    status?: "planned" | "completed" | "skipped" | "adjusted";
    chosenAlternative?: string;
    notes?: string;
  },
): Promise<boolean> {
  const collection = db.collection<StoredMicroPlan>(COLLECTIONS.microPlans);
  const now = new Date().toISOString();

  const updateFields: Record<string, unknown> = {
    updatedAt: now,
  };
  if (patch.status) {
    updateFields["sessions.$.status"] = patch.status;
  }
  if (patch.notes !== undefined) {
    updateFields["sessions.$.notes"] = patch.notes;
  }
  if (patch.chosenAlternative) {
    updateFields["sessions.$.chosenAlternative"] = patch.chosenAlternative;
  }

  const result = await collection.updateOne(
    { userId, "sessions.id": sessionId },
    { $set: updateFields },
  );

  return result.matchedCount > 0;
}

/**
 * Replaces every editable field of one planned session (used by automatic
 * check-in adaptations, which must persist duration, intensity and blocks).
 */
export async function replacePlannedSession(
  db: Db,
  userId: string,
  sessionId: string,
  session: PlannedSession,
): Promise<boolean> {
  const collection = db.collection<StoredMicroPlan>(COLLECTIONS.microPlans);
  const now = new Date().toISOString();

  const result = await collection.updateOne(
    { userId, "sessions.id": sessionId },
    {
      $set: {
        "sessions.$": { ...session, id: sessionId },
        updatedAt: now,
      },
    },
  );

  return result.matchedCount > 0;
}
