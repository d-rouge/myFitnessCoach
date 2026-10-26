import "dotenv/config";
import { readFile } from "node:fs/promises";
import { loadEnv } from "@health-trainer/config";
import { GarminPersonalClient } from "@health-trainer/integrations";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
};

/** Print keys and types, never values. */
function shape(value: unknown, depth = 0): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      item: value.length > 0 ? shape(value[0], depth + 1) : null,
    };
  }
  if (typeof value === "object") {
    if (depth > 4) return "object";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        shape(item, depth + 1),
      ]),
    );
  }
  return typeof value;
}

async function main(): Promise<void> {
  const env = loadEnv();
  let apiKey = env.GARMIN_PERSONAL_API_KEY;
  if (!apiKey) {
    apiKey = (await readFile("secrets/garmin-key.txt", "utf8")).trim();
  }

  const client = new GarminPersonalClient({ apiKey, timeoutMs: 20_000 });
  const today = isoDate(new Date());
  const from = daysAgo(2);
  const date = daysAgo(1);

  const [summaries, sleep, hrv, bodyBattery, dailyHeartRate, spo2, weight] = await Promise.all([
    client.getDailySummaries(from, today),
    client.getDailySleep(date),
    client.getHrv(date),
    client.getBodyBattery(from, today),
    client.getDailyHeartRate(date),
    client.getSpo2(date),
    client.getWeightMeasurements(daysAgo(30), today),
  ]);

  const report = {
    dailySummaries: shape(summaries),
    sleep: shape(sleep),
    hrv: shape(hrv),
    bodyBattery: shape(bodyBattery),
    dailyHeartRate: shape(dailyHeartRate),
    spo2: shape(spo2),
    weight: shape(weight),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
