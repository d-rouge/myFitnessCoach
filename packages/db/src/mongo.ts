import { type Db, MongoClient } from "mongodb";

export interface MongoConnection {
  client: MongoClient;
  db: Db;
}

export async function connectMongo(uri: string, dbName?: string): Promise<MongoConnection> {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
  });

  await client.connect();
  return { client, db: dbName ? client.db(dbName) : client.db() };
}

export interface MongoPingResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Lightweight connectivity check used by /api/health.
 * It never throws: a degraded database should not crash the API.
 */
export async function pingMongo(uri: string, timeoutMs = 1_500): Promise<MongoPingResult> {
  const startedAt = Date.now();
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
  });

  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown MongoDB error",
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}
