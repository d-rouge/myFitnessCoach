import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "@health-trainer/config";
import { GarminPersonalClient } from "@health-trainer/integrations";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
};

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const key of [
      "activityList",
      "dateWeightList",
      "weightList",
      "items",
      "data",
      "summaries",
      "dailySummaries",
    ]) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate;
    }
  }
  return [];
};

const keysOf = (value: unknown): string[] =>
  value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];

async function main(): Promise<void> {
  const env = loadEnv();
  let apiKey = env.GARMIN_PERSONAL_API_KEY;
  let keySource = ".env";

  if (!apiKey) {
    try {
      apiKey = (await readFile("secrets/garmin-key.txt", "utf8")).trim();
      keySource = "secrets/garmin-key.txt";
    } catch {
      // Fall through to the instructions below.
    }
  }

  if (!apiKey) {
    console.error(
      "GARMIN_PERSONAL_API_KEY is not set.\n" +
        "1. Create a key at https://connect.garmin.com/app/settings/personalApiToken\n" +
        "2. Add it to .env or secrets/garmin-key.txt\n" +
        "3. Run: npm run spike:garmin",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Key source: ${keySource}`);

  const client = new GarminPersonalClient({ apiKey, timeoutMs: 20_000 });
  const today = isoDate(new Date());
  const from = daysAgo(14);
  const weightFrom = daysAgo(30);
  const hrvDate = daysAgo(1);

  console.log("Garmin spike — starting");
  console.log(`Range: ${from} → ${today}`);

  const startedAt = Date.now();
  const health = await client.healthCheck();
  console.log(
    `Health check: ${health.ok ? "OK" : "FAILED"} (${health.latencyMs} ms)${
      health.error ? ` — ${health.error}` : ""
    }`,
  );

  if (!health.ok) {
    process.exitCode = 1;
    return;
  }

  const [profile, activities, sleep, hrv, weight, steps, stress] = await Promise.all([
    client.getProfileSettings(),
    client.searchActivities({ start: 0, limit: 10, startDate: from, endDate: today }),
    client.getDailySleep(hrvDate),
    client.getHrv(hrvDate),
    client.getWeightMeasurements(weightFrom, today),
    client.getSteps(daysAgo(7), today),
    client.getStress(daysAgo(7), today),
  ]);

  const activityList = asArray(activities);
  const weightList = asArray(weight);
  const stepList = asArray(steps);
  const stressList = asArray(stress);

  const safe = async (
    label: string,
    promise: Promise<unknown>,
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> => {
    try {
      return { ok: true, value: await promise };
    } catch (error) {
      return {
        ok: false,
        error: `${label}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };

  const describe = (result: Awaited<ReturnType<typeof safe>>) => {
    if (!result.ok) return { ok: false, error: result.error };
    const list = asArray(result.value);
    const sample = list[0] ?? result.value;
    return { ok: true, count: list.length, keys: keysOf(sample) };
  };

  const [dailySummaries, bodyBattery, dailyHeartRate, spo2, zones, hydration, fitnessAge] =
    await Promise.all([
      safe("daily-summaries", client.getDailySummaries(daysAgo(7), today)),
      safe("body-battery", client.getBodyBattery(daysAgo(7), today)),
      safe("daily-heart-rate", client.getDailyHeartRate(hrvDate)),
      safe("spo2", client.getSpo2(hrvDate)),
      safe("heart-rate-zones", client.getHeartRateZones()),
      safe("hydration", client.getHydration(daysAgo(7), today)),
      safe("fitness-age", client.getFitnessAge(hrvDate)),
    ]);

  let activityDownload: { bytes: number; isZip: boolean } | undefined;
  if (process.argv.includes("--download")) {
    const first = activityList[0] as Record<string, unknown> | undefined;
    const activityId = typeof first?.activityId === "number" ? first.activityId : undefined;
    if (activityId === undefined) {
      console.warn("No activity ID available for download test.");
    } else {
      const zip = await client.downloadActivity(activityId);
      const bytes = new Uint8Array(zip);
      activityDownload = {
        bytes: bytes.byteLength,
        isZip: bytes[0] === 0x50 && bytes[1] === 0x4b,
      };
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    range: { from, to: today, hrvDate, weightFrom },
    timing: { totalMs: Date.now() - startedAt },
    profile: { keys: keysOf(profile) },
    activities: {
      count: activityList.length,
      sampleKeys: keysOf(activityList[0]),
    },
    activityDownload,
    sleep: { present: sleep !== null, keys: keysOf(sleep) },
    hrv: { present: hrv !== null, keys: keysOf(hrv) },
    weight: {
      count: weightList.length,
      sampleKeys: keysOf(weightList[0]),
    },
    steps: {
      count: stepList.length,
      sampleKeys: keysOf(stepList[0]),
    },
    stress: {
      count: stressList.length,
      sampleKeys: keysOf(stressList[0]),
    },
    metrics: {
      dailySummaries: describe(dailySummaries),
      bodyBattery: describe(bodyBattery),
      dailyHeartRate: describe(dailyHeartRate),
      spo2: describe(spo2),
      heartRateZones: describe(zones),
      hydration: describe(hydration),
      fitnessAge: describe(fitnessAge),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (process.argv.includes("--write")) {
    const output = resolve(process.cwd(), "docs/spikes/garmin.local.json");
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nSaved redacted report to ${output}`);
  }

  console.log(
    "\nNext: write the verdict in docs/spikes/garmin.md (go / go with workaround / no-go).",
  );
}

main().catch((error: unknown) => {
  console.error("Garmin spike failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
