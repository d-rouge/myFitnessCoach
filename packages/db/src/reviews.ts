import type { Review } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";

export interface StoredReview extends Review {
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export async function saveReview(db: Db, userId: string, review: Review): Promise<void> {
  const collection = db.collection<StoredReview>(COLLECTIONS.reviews);
  const now = new Date().toISOString();

  await collection.updateOne(
    { userId, id: review.id },
    {
      $set: {
        ...review,
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

export async function getLatestReview(db: Db, userId: string): Promise<Review | null> {
  const collection = db.collection<StoredReview>(COLLECTIONS.reviews);
  const doc = await collection.find({ userId }).sort({ startDate: -1 }).limit(1).next();
  if (!doc) return null;

  const {
    _id: _,
    userId: _u,
    createdAt: _c,
    updatedAt: _up,
    ...review
  } = doc as unknown as StoredReview & {
    _id: unknown;
  };
  return review as Review;
}

/** Returns the review that covers exactly the given week, if it exists. */
export async function getReviewForWeek(
  db: Db,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<Review | null> {
  const collection = db.collection<StoredReview>(COLLECTIONS.reviews);
  const doc = await collection.findOne({ userId, startDate, endDate });
  if (!doc) return null;

  const {
    _id: _,
    userId: _u,
    createdAt: _c,
    updatedAt: _up,
    ...review
  } = doc as unknown as StoredReview & {
    _id: unknown;
  };
  return review as Review;
}

export async function getReviewsHistory(db: Db, userId: string, limit = 12): Promise<Review[]> {
  const collection = db.collection<StoredReview>(COLLECTIONS.reviews);
  const cursor = collection.find({ userId }).sort({ startDate: -1 }).limit(limit);
  const docs = await cursor.toArray();

  return docs.map((doc) => {
    const {
      _id: _,
      userId: _u,
      createdAt: _c,
      updatedAt: _up,
      ...review
    } = doc as unknown as StoredReview & {
      _id: unknown;
    };
    return review as Review;
  });
}
