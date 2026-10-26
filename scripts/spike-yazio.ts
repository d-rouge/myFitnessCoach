import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "@health-trainer/config";
import { YazioClient, type YazioCredentials } from "@health-trainer/integrations";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const keysOf = (value: unknown): string[] => {
  const record = asRecord(value);
  return record ? Object.keys(record) : [];
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

async function credentials(): Promise<YazioCredentials | undefined> {
  const env = loadEnv();
  if (env.YAZIO_EMAIL && env.YAZIO_PASSWORD) {
    return { email: env.YAZIO_EMAIL, password: env.YAZIO_PASSWORD };
  }

  try {
    const raw = await readFile("secrets/yazio.json", "utf8");
    const parsed = JSON.parse(raw) as {
      email?: unknown;
      username?: unknown;
      password?: unknown;
    };
    const email =
      typeof parsed.email === "string"
        ? parsed.email
        : typeof parsed.username === "string"
          ? parsed.username
          : undefined;
    const password = typeof parsed.password === "string" ? parsed.password : undefined;
    return email && password ? { email, password } : undefined;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const auth = await credentials();

  if (!auth) {
    console.error(
      "Yazio credentials are not configured.\n" +
        '1. Put { "email": "...", "password": "..." } in secrets/yazio.json (ignored by git)\n' +
        "   or set YAZIO_EMAIL and YAZIO_PASSWORD in .env\n" +
        "2. Run: npm run spike:yazio",
    );
    process.exitCode = 1;
    return;
  }

  const client = new YazioClient({ credentials: auth, timeoutMs: 25_000 });
  const today = isoDate(new Date());
  const yesterday = daysAgo(1);

  console.log("Yazio spike — starting");
  const health = await client.healthCheck();
  console.log(
    `Health check: ${health.ok ? "OK" : "FAILED"} (${health.latencyMs} ms) — ${health.baseUrl}`,
  );

  if (!health.ok) {
    console.error(health.error);
    process.exitCode = 1;
    return;
  }

  const [user, summaryToday, summaryYesterday, weight, goals, consumed, settings] =
    await Promise.all([
      client.getUser(),
      client.getDailySummary(today),
      client.getDailySummary(yesterday),
      client.getWeight(today),
      client.getGoals(today),
      client.getConsumedItems(yesterday),
      client.getSettings(),
    ]);

  const summaryRecord = asRecord(summaryToday);
  const meals = asRecord(summaryRecord?.meals);
  const breakfast = asRecord(meals?.breakfast);
  const breakfastNutrients = asRecord(breakfast?.nutrients);
  const consumedRecord = asRecord(consumed);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: client.getBaseUrl(),
    health: { ok: health.ok, latencyMs: health.latencyMs },
    user: { keys: keysOf(user) },
    summary: {
      present: summaryToday !== null,
      keys: keysOf(summaryToday),
      meals: keysOf(meals),
      hasMealNutrients: breakfastNutrients !== undefined,
      breakfastNutrientKeys: keysOf(breakfastNutrients),
      goalsKeys: keysOf(asRecord(summaryRecord?.goals)),
      unitsKeys: keysOf(asRecord(summaryRecord?.units)),
      userKeys: keysOf(asRecord(summaryRecord?.user)),
    },
    summaryYesterday: { present: summaryYesterday !== null, keys: keysOf(summaryYesterday) },
    weight: { present: weight !== null, keys: keysOf(weight) },
    goals: { keys: keysOf(goals) },
    consumed: {
      products: asArray(consumedRecord?.products).length,
      recipe_portions: asArray(consumedRecord?.recipe_portions).length,
      simple_products: asArray(consumedRecord?.simple_products).length,
    },
    settings: { keys: keysOf(settings) },
  };

  console.log(JSON.stringify(report, null, 2));

  if (process.argv.includes("--write")) {
    const output = resolve(process.cwd(), "docs/spikes/yazio.local.json");
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nSaved redacted report to ${output}`);
  }

  console.log("\nNext: write the verdict in docs/spikes/yazio.md.");
}

main().catch((error: unknown) => {
  console.error("Yazio spike failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
