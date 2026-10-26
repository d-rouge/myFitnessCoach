import "dotenv/config";
import { readFile } from "node:fs/promises";
import { loadEnv } from "@health-trainer/config";
import { GarminPersonalClient, parseGarminActivityZip } from "@health-trainer/integrations";

async function main() {
  const env = loadEnv();
  let apiKey = env.GARMIN_PERSONAL_API_KEY;
  if (!apiKey) apiKey = (await readFile("secrets/garmin-key.txt", "utf8")).trim();

  const client = new GarminPersonalClient({ apiKey, timeoutMs: 30_000 });
  const activities = await client.searchActivities({ start: 0, limit: 1 });
  const list = Array.isArray(activities)
    ? activities
    : ((activities as { activityList?: unknown[] }).activityList ?? []);
  const first = list[0] as
    | { activityId?: number; startTimeLocal?: string; activityType?: { typeKey?: string } }
    | undefined;

  if (!first?.activityId) throw new Error("No activity found");

  const zip = await client.downloadActivity(first.activityId);
  const analysis = await parseGarminActivityZip(new Uint8Array(zip), {
    userId: "personal",
    externalId: String(first.activityId),
    localDate: first.startTimeLocal?.slice(0, 10),
    fetchedAt: new Date().toISOString(),
  });

  console.log(
    JSON.stringify(
      {
        externalId: analysis.externalId,
        sport: analysis.sport,
        date: analysis.date,
        summary: analysis.summary,
        derived: analysis.derived,
        hrZones: analysis.hrZones,
        laps: analysis.laps.length,
        splits: analysis.splits.length,
        brief: analysis.brief,
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
