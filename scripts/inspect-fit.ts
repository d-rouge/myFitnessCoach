import "dotenv/config";
import { readFile } from "node:fs/promises";
import { loadEnv } from "@health-trainer/config";
import { GarminPersonalClient } from "@health-trainer/integrations";
import { unzipSync } from "fflate";
import FitParser from "fit-file-parser";

const shape = (value: unknown, depth = 0): unknown => {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      item: value[0] ? shape(value[0], depth + 1) : null,
    };
  }
  if (typeof value === "object") {
    if (depth > 3) return "object";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        shape(item, depth + 1),
      ]),
    );
  }
  return typeof value;
};

async function main() {
  const env = loadEnv();
  let apiKey = env.GARMIN_PERSONAL_API_KEY;
  if (!apiKey) apiKey = (await readFile("secrets/garmin-key.txt", "utf8")).trim();

  const client = new GarminPersonalClient({ apiKey, timeoutMs: 30_000 });
  const activities = await client.searchActivities({ start: 0, limit: 1 });
  const list = Array.isArray(activities)
    ? activities
    : ((activities as { activityList?: unknown[] }).activityList ?? []);
  const first = list[0] as { activityId?: number; activityType?: { typeKey?: string } } | undefined;
  if (!first?.activityId) throw new Error("No activity found");

  const zip = await client.downloadActivity(first.activityId);
  const files = unzipSync(new Uint8Array(zip));
  const fitName = Object.keys(files).find((name) => name.toLowerCase().endsWith(".fit"));
  if (!fitName) throw new Error(`No FIT in ZIP: ${Object.keys(files).join(", ")}`);

  const fitBytes = files[fitName];
  if (!fitBytes) throw new Error("Empty FIT file");

  const parser = new FitParser({ mode: "list", speedUnit: "km/h", lengthUnit: "km" });
  const parsed = (await parser.parseAsync(Buffer.from(fitBytes))) as unknown as Record<
    string,
    unknown
  >;

  console.log(
    JSON.stringify(
      {
        activityId: first.activityId,
        typeKey: first.activityType?.typeKey,
        fitName,
        fitBytes: fitBytes.byteLength,
        topLevelKeys: Object.keys(parsed),
        fileId: shape(parsed.fileId),
        sessions: shape(parsed.sessions),
        timeInZone: shape(parsed.time_in_zone),
        activityMetrics: shape(parsed.activity_metrics),
        splits: shape(parsed.splits),
        sets: shape(parsed.sets),
        hrZone: shape(parsed.hr_zone),
        laps: shape(parsed.laps),
        records: shape(parsed.records),
        events: shape(parsed.events),
        lengths: shape(parsed.lengths),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
