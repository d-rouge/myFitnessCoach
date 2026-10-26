import type { Checkin } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";

export interface StoredCheckin extends Checkin {
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export async function saveCheckin(db: Db, userId: string, checkin: Checkin): Promise<void> {
  const collection = db.collection<StoredCheckin>(COLLECTIONS.checkins);
  const now = new Date().toISOString();

  await collection.updateOne(
    { userId, date: checkin.date, type: checkin.type },
    {
      $set: {
        ...checkin,
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

export async function getCheckin(
  db: Db,
  userId: string,
  date: string,
  type: "morning" | "post_session",
): Promise<Checkin | null> {
  const collection = db.collection<StoredCheckin>(COLLECTIONS.checkins);
  const doc = await collection.findOne({ userId, date, type });
  if (!doc) return null;

  const {
    _id: _,
    userId: _u,
    createdAt: _c,
    updatedAt: _up,
    ...checkin
  } = doc as unknown as StoredCheckin & {
    _id: unknown;
  };
  return checkin as Checkin;
}

export async function getRecentCheckins(db: Db, userId: string, limit = 14): Promise<Checkin[]> {
  const collection = db.collection<StoredCheckin>(COLLECTIONS.checkins);
  const cursor = collection.find({ userId }).sort({ date: -1 }).limit(limit);
  const docs = await cursor.toArray();

  return docs.map((doc) => {
    const {
      _id: _,
      userId: _u,
      createdAt: _c,
      updatedAt: _up,
      ...checkin
    } = doc as unknown as StoredCheckin & {
      _id: unknown;
    };
    return checkin as Checkin;
  });
}
