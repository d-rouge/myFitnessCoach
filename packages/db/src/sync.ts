import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

export type SyncStatus = "running" | "ok" | "partial" | "error";

export interface SyncStats {
  activities: number;
  metrics: number;
  errors: string[];
}

export interface SyncRun {
  runId: string;
  userId: string;
  provider: string;
  startedAt: string;
  finishedAt?: string;
  status: SyncStatus;
  stats: SyncStats;
  error?: string;
}

export interface SyncState {
  userId: string;
  provider: string;
  lastSyncAt: string;
  status: SyncStatus;
  error?: string;
}

export async function startSyncRun(
  db: Db,
  input: {
    userId: string;
    provider: string;
    startedAt: string;
    stats: SyncStats;
  },
): Promise<string> {
  const run: SyncRun = {
    runId: randomUUID(),
    ...input,
    status: "running",
  };

  await db.collection<SyncRun>(COLLECTIONS.syncRuns).insertOne(run);
  return run.runId;
}

export async function finishSyncRun(
  db: Db,
  runId: string,
  update: {
    status: Exclude<SyncStatus, "running">;
    stats: SyncStats;
    error?: string;
  },
): Promise<void> {
  await db.collection<SyncRun>(COLLECTIONS.syncRuns).updateOne(
    { runId },
    {
      $set: {
        status: update.status,
        stats: update.stats,
        error: update.error,
        finishedAt: new Date().toISOString(),
      },
    },
  );
}

export async function updateSyncState(db: Db, state: SyncState): Promise<void> {
  await db
    .collection<SyncState>(COLLECTIONS.syncState)
    .updateOne(
      { userId: state.userId, provider: state.provider },
      { $set: state },
      { upsert: true },
    );
}

export async function getSyncState(
  db: Db,
  userId: string,
  provider: string,
): Promise<SyncState | null> {
  return db.collection<SyncState>(COLLECTIONS.syncState).findOne({ userId, provider });
}
