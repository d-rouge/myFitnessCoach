import { getCurrentBaseline } from "@health-trainer/db";
import { resolveTimeZone } from "@health-trainer/domain";
import type { Db } from "mongodb";

/**
 * The authenticated athlete's IANA timezone, read from the active baseline.
 * Never fall back to UTC: "today" must be the athlete's calendar day.
 */
export async function getUserTimeZone(db: Db, userId: string): Promise<string> {
  const baseline = await getCurrentBaseline(db, userId);
  return resolveTimeZone(baseline?.profile.timezone);
}
