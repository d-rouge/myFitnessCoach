import type { User } from "@health-trainer/domain";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

export async function upsertUser(db: Db, user: User): Promise<User> {
  await db.collection<User>(COLLECTIONS.users).updateOne(
    { id: user.id },
    {
      $set: {
        email: user.email.toLowerCase(),
        name: user.name,
        picture: user.picture,
        roles: user.roles,
        lastLoginAt: user.lastLoginAt,
      },
      $setOnInsert: {
        id: user.id,
        createdAt: user.createdAt,
      },
    },
    { upsert: true },
  );

  const saved = await getUserById(db, user.id);
  if (!saved) {
    throw new Error(`Failed to retrieve user after upsert: ${user.id}`);
  }
  return saved;
}

export async function getUserById(db: Db, id: string): Promise<User | null> {
  const doc = await db.collection<User>(COLLECTIONS.users).findOne({ id });
  if (!doc) return null;
  const { _id: _, ...rest } = doc as unknown as { _id?: unknown } & User;
  return rest;
}

export async function getUserByEmail(db: Db, email: string): Promise<User | null> {
  const doc = await db.collection<User>(COLLECTIONS.users).findOne({ email: email.toLowerCase() });
  if (!doc) return null;
  const { _id: _, ...rest } = doc as unknown as { _id?: unknown } & User;
  return rest;
}

export async function countUsers(db: Db): Promise<number> {
  return db.collection(COLLECTIONS.users).countDocuments();
}
