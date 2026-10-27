import "dotenv/config";

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { ensureIndexes, type UserDataBackup, upsertUser } from "@health-trainer/db";
import {
  type Baseline,
  beginnerPersona,
  intermediatePersona,
  type MacroPlan,
  type MicroPlan,
  type User,
} from "@health-trainer/domain";
import { MongoClient } from "mongodb";
import { signJwt } from "../apps/api/src/auth/jwt.util.js";

const PORT = Number(process.env.E2E_PORT ?? "3998");
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const MONGO_URI = process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/health_trainer_e2e";

function databaseName(uri: string): string {
  const url = new URL(uri);
  return decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "health_trainer_e2e";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: atteso ${String(expected)}, ricevuto ${String(actual)}`);
  }
}

async function request(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function waitForHealth(child: ChildProcess, stderr: () => string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API terminata durante l'avvio.\n${stderr()}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch {
      // API not up yet.
    }
    await sleep(500);
  }
  throw new Error(`API non raggiungibile su ${BASE_URL}.\n${stderr()}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null) return;
    await sleep(250);
  }
  child.kill("SIGKILL");
}

async function main(): Promise<void> {
  const dbName = databaseName(MONGO_URI);
  assert(
    dbName.endsWith("_e2e"),
    `Rifiuto di eseguire l'e2e su "${dbName}": il database deve terminare con "_e2e".`,
  );
  assert(existsSync("apps/api/dist/main.js"), "Build API mancante: esegui npm run build.");

  const jwtSecret = process.env.JWT_SECRET;
  assert(
    jwtSecret && jwtSecret.length >= 32,
    "JWT_SECRET mancante o troppo corto: caricalo da .env prima dell'e2e.",
  );

  const now = new Date().toISOString();
  const userA: User = {
    id: "e2e_user_a",
    email: "e2e-a@example.test",
    name: "E2E Athlete A",
    roles: ["athlete"],
    createdAt: now,
    lastLoginAt: now,
  };
  const userB: User = {
    id: "e2e_user_b",
    email: "e2e-b@example.test",
    name: "E2E Athlete B",
    roles: ["athlete"],
    createdAt: now,
    lastLoginAt: now,
  };

  const tokenA = signJwt(
    { sub: userA.id, email: userA.email, name: userA.name, roles: userA.roles },
    jwtSecret,
  );
  const tokenB = signJwt(
    { sub: userB.id, email: userB.email, name: userB.name, roles: userB.roles },
    jwtSecret,
  );

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(dbName);

  let child: ChildProcess | null = null;
  let stderrBuffer = "";
  const results: string[] = [];

  try {
    await db.dropDatabase();
    await ensureIndexes(db);
    await upsertUser(db, userA);
    await upsertUser(db, userB);

    child = spawn(process.execPath, ["apps/api/dist/main.js"], {
      env: {
        ...process.env,
        NODE_ENV: "development",
        API_PORT: String(PORT),
        MONGODB_URI: MONGO_URI,
        JWT_SECRET: jwtSecret,
        ENABLE_DEV_ENDPOINTS: "false",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer = `${stderrBuffer}${chunk.toString()}`.slice(-4000);
    });

    await waitForHealth(child, () => stderrBuffer);

    // --- Authentication gate -------------------------------------------------
    const anonymousMe = await request("/me");
    assertEqual(anonymousMe.status, 401, "GET /me senza token");
    results.push("401 senza token");

    const meA = await request("/me", tokenA);
    const meABody = await readJson<User>(meA);
    assertEqual(meA.status, 200, "GET /me utente A");
    assertEqual(meABody.id, userA.id, "identità utente A");
    results.push("identità JWT distinta per A");

    // --- Baselines and plans -------------------------------------------------
    const saveA = await request("/baseline", tokenA, {
      method: "POST",
      body: JSON.stringify({ ...beginnerPersona, userId: "ignored-client-id" }),
    });
    assertEqual(saveA.status, 201, "POST baseline utente A");

    const saveB = await request("/baseline", tokenB, {
      method: "POST",
      body: JSON.stringify(intermediatePersona),
    });
    assertEqual(saveB.status, 201, "POST baseline utente B");

    const baselineA = await readJson<Baseline>(await request("/baseline", tokenA));
    const baselineB = await readJson<Baseline>(await request("/baseline", tokenB));
    assertEqual(baselineA.userId, userA.id, "baseline A associata ad A");
    assertEqual(baselineB.userId, userB.id, "baseline B associata a B");
    results.push("baseline salvate sull'utente autenticato, userId del body ignorato");

    const generateA = await request("/plan/macro/generate", tokenA, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertEqual(generateA.status, 201, "POST macro/generate utente A");
    const planA = await readJson<{ macroPlan: MacroPlan; microPlan: MicroPlan }>(generateA);

    const generateB = await request("/plan/macro/generate", tokenB, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertEqual(generateB.status, 201, "POST macro/generate utente B");
    const planB = await readJson<{ macroPlan: MacroPlan; microPlan: MicroPlan }>(generateB);

    assert(planA.macroPlan.id !== planB.macroPlan.id, "i due macro-piani devono essere distinti");
    assert(planA.microPlan.id !== planB.microPlan.id, "i due micro-piani devono essere distinti");

    const macroA = await readJson<MacroPlan>(await request("/plan/macro", tokenA));
    const microA = await readJson<MicroPlan>(await request("/plan/micro", tokenA));
    const macroB = await readJson<MacroPlan>(await request("/plan/macro", tokenB));
    const microB = await readJson<MicroPlan>(await request("/plan/micro", tokenB));
    assertEqual(macroA.id, planA.macroPlan.id, "A legge il proprio macro-piano");
    assertEqual(microA.id, planA.microPlan.id, "A legge il proprio micro-piano");
    assertEqual(macroB.id, planB.macroPlan.id, "B legge il proprio macro-piano");
    assertEqual(microB.id, planB.microPlan.id, "B legge il proprio micro-piano");
    results.push("piani isolati per utente");

    const sessionA = planA.microPlan.sessions.find((session) => session.sport === "running");
    assert(sessionA, "la settimana di A deve contenere una sessione di corsa");

    const patchForeign = await request(`/plan/sessions/${sessionA.id}`, tokenB, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
    assertEqual(patchForeign.status, 404, "B non può modificare la sessione di A");
    results.push("PATCH cross-utente respinto con 404");

    const fitForeign = await request(`/export/workouts/session/${sessionA.id}.fit`, tokenB);
    assertEqual(fitForeign.status, 404, "B non può esportare la sessione di A");

    const fitOwn = await request(`/export/workouts/session/${sessionA.id}.fit`, tokenA);
    assertEqual(fitOwn.status, 200, "A esporta la propria sessione");
    const fitBytes = new Uint8Array(await fitOwn.arrayBuffer());
    assertEqual(
      String.fromCharCode(...fitBytes.slice(8, 12)),
      ".FIT",
      "firma del file FIT esportato",
    );
    results.push("export FIT isolato per utente");

    // --- Check-ins -----------------------------------------------------------
    const timezoneA = baselineA.profile.timezone || "Europe/Rome";
    const todayA = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezoneA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const checkinA = await request("/checkin", tokenA, {
      method: "POST",
      body: JSON.stringify({
        date: todayA,
        type: "morning",
        energy: 4,
        sleepQuality: 4,
        soreness: 1,
        availableTimeMin: 45,
      }),
    });
    assertEqual(checkinA.status, 201, "POST check-in utente A");

    const todayBodyA = await readJson<{ date: string; morning: unknown }>(
      await request("/checkin/today", tokenA),
    );
    const todayBodyB = await readJson<{ date: string; morning: unknown }>(
      await request("/checkin/today", tokenB),
    );
    assert(todayBodyA.morning, "A deve vedere il proprio check-in di oggi");
    assertEqual(todayBodyB.morning, null, "B non deve vedere il check-in di A");
    results.push("check-in isolati per utente");

    // --- Backups -------------------------------------------------------------
    const backupA = await readJson<UserDataBackup>(await request("/export/backup", tokenA));
    const backupB = await readJson<UserDataBackup>(await request("/export/backup", tokenB));
    assertEqual(backupA.userId, userA.id, "backup A limitato ad A");
    assertEqual(backupB.userId, userB.id, "backup B limitato a B");
    assertEqual(backupA.data.macroPlans.length, 1, "backup A contiene il piano di A");
    assertEqual(backupB.data.macroPlans.length, 1, "backup B contiene il piano di B");
    assertEqual(backupA.data.checkins.length, 1, "backup A contiene il check-in di A");
    assertEqual(backupB.data.checkins.length, 0, "backup B non contiene check-in di A");
    results.push("backup isolati e completi");

    // --- Missing plan returns 404 -------------------------------------------
    const userC: User = {
      id: "e2e_user_c",
      email: "e2e-c@example.test",
      name: "E2E Athlete C",
      roles: ["athlete"],
      createdAt: now,
      lastLoginAt: now,
    };
    await upsertUser(db, userC);
    const tokenC = signJwt(
      { sub: userC.id, email: userC.email, name: userC.name, roles: userC.roles },
      jwtSecret,
    );
    const emptyBaseline = await request("/baseline", tokenC);
    const emptyMacro = await request("/plan/macro", tokenC);
    const emptyMicro = await request("/plan/micro", tokenC);
    const emptyBody = await emptyBaseline.text();
    assertEqual(emptyBaseline.status, 404, "baseline assente → 404");
    assert(emptyBody.length > 0, "la baseline assente non deve rispondere 200 con body vuoto");
    assertEqual(emptyMacro.status, 404, "macro-piano assente → 404");
    assertEqual(emptyMicro.status, 404, "micro-piano assente → 404");
    results.push("baseline e piani assenti rispondono 404 (niente 200 vuoto)");

    console.log(`\nE2E OK — ${results.length} verifiche contro MongoDB reale (${dbName}):`);
    for (const result of results) console.log(`  ✓ ${result}`);
  } finally {
    if (child) await stopChild(child);
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
}

main().catch((error) => {
  console.error(`\nE2E FALLITO: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
