import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";

/** Local (email + password) credentials, kept apart from the public user. */
export interface StoredCredentials {
  userId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export async function saveCredentials(
  db: Db,
  credentials: StoredCredentials,
): Promise<StoredCredentials> {
  const email = credentials.email.toLowerCase();
  await db.collection<StoredCredentials>(COLLECTIONS.credentials).updateOne(
    { userId: credentials.userId },
    {
      $set: {
        email,
        passwordHash: credentials.passwordHash,
        updatedAt: credentials.updatedAt,
      },
      $setOnInsert: {
        userId: credentials.userId,
        createdAt: credentials.createdAt,
      },
    },
    { upsert: true },
  );

  const saved = await getCredentialsByUserId(db, credentials.userId);
  if (!saved) {
    throw new Error(`Failed to retrieve credentials after upsert: ${credentials.userId}`);
  }
  return saved;
}

export async function getCredentialsByUserId(
  db: Db,
  userId: string,
): Promise<StoredCredentials | null> {
  return db.collection<StoredCredentials>(COLLECTIONS.credentials).findOne({ userId });
}

export async function getCredentialsByEmail(
  db: Db,
  email: string,
): Promise<StoredCredentials | null> {
  return db.collection<StoredCredentials>(COLLECTIONS.credentials).findOne({
    email: email.toLowerCase(),
  });
}

export async function deleteCredentials(db: Db, userId: string): Promise<void> {
  await db.collection(COLLECTIONS.credentials).deleteMany({ userId });
}
