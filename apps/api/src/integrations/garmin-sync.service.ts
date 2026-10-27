import {
  countActivities,
  countDailyMetricsBySource,
  finishSyncRun,
  getActivityByExternalId,
  getRecentActivities,
  getRecentDailyMetricsBySource,
  getActivityAnalysis as getStoredActivityAnalysis,
  getSyncState,
  startSyncRun,
  updateSyncState,
  upsertActivities,
  upsertActivityAnalysis,
  upsertDailyMetrics,
} from "@health-trainer/db";
import {
  type ActivityAnalysis,
  addDaysIso,
  type DailyMetrics,
  todayLocalDate,
} from "@health-trainer/domain";
import {
  buildGarminDailyMetrics,
  type DatedGarminRaw,
  mapGarminActivities,
  parseGarminActivityZip,
} from "@health-trainer/integrations";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { getUserTimeZone } from "../common/user-timezone.js";
import { GARMIN_PROVIDER, PERSONAL_USER_ID } from "../config/constants.js";
import { MongoService } from "../database/mongo.service.js";
import { GarminService } from "./garmin.service.js";

export interface GarminSyncResult {
  status: "ok" | "partial";
  from: string;
  to: string;
  days: number;
  activities: number;
  metrics: number;
  errors: string[];
  syncedAt: string;
}

export interface GarminActivityDto {
  id: string;
  date: string;
  sport: string;
  title: string | null;
  durationMin: number;
  distanceKm: number | null;
  avgHr: number | null;
}

export interface GarminMetricsDto {
  date: string;
  restingHr: number | null;
  hrvAvgMs: number | null;
  sleepMinutes: number | null;
  steps: number | null;
  stressAvg: number | null;
  bodyBatteryEnd: number | null;
}

export interface GarminOverview {
  configured: boolean;
  lastSync: string | null;
  status: "never" | "running" | "ok" | "partial" | "error";
  error: string | null;
  counts: { activities: number; metrics: number };
  activities: GarminActivityDto[];
  metrics: GarminMetricsDto[];
}

type SafeResult<T> = { ok: true; value: T } | { ok: false; error: string };

const todayIso = (timeZone: string): string => todayLocalDate(timeZone);

const daysAgoIso = (days: number, timeZone: string): string =>
  addDaysIso(todayLocalDate(timeZone), -days);

const eachDate = (from: string, to: string): string[] => {
  const dates: string[] = [];
  for (let current = from; current <= to; current = addDaysIso(current, 1)) {
    dates.push(current);
  }
  return dates;
};

const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let index = 0;

  const worker = async (): Promise<void> => {
    while (index < items.length) {
      const current = index;
      index += 1;
      const item = items[current];
      if (item === undefined) continue;
      results[current] = await mapper(item);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () => worker()),
  );

  return results;
};

const safe = async <T>(
  label: string,
  date: string,
  operation: () => Promise<T>,
): Promise<SafeResult<T>> => {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return {
      ok: false,
      error: `${label} ${date}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

@Injectable()
export class GarminSyncService {
  constructor(
    private readonly garmin: GarminService,
    private readonly mongo: MongoService,
  ) {}

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async sync(days = 7): Promise<GarminSyncResult> {
    const syncDays = Math.min(30, Math.max(1, Math.trunc(days)));
    const db = await this.db();
    const userId = PERSONAL_USER_ID;
    const provider = GARMIN_PROVIDER;
    const timeZone = await getUserTimeZone(db, userId);
    const to = todayIso(timeZone);
    const from = daysAgoIso(syncDays - 1, timeZone);
    const fetchedAt = new Date().toISOString();
    const errors: string[] = [];

    const runId = await startSyncRun(db, {
      userId,
      provider,
      startedAt: fetchedAt,
      stats: { activities: 0, metrics: 0, errors: [] },
    });

    try {
      const client = this.garmin.getClient();

      const [activitiesRaw, summariesRaw, bodyBatteryRaw, weightRaw] = await Promise.all([
        client.searchActivities({ start: 0, limit: 100, startDate: from, endDate: to }),
        client.getDailySummaries(from, to),
        client.getBodyBattery(from, to),
        client.getWeightMeasurements(daysAgoIso(Math.max(syncDays, 30), timeZone), to),
      ]);

      const activities = mapGarminActivities(activitiesRaw, {
        userId,
        fetchedAt,
      });

      const dates = eachDate(from, to);
      const daily = await mapLimit(dates, 3, async (date) => {
        const [sleep, hrv, heartRate, spo2] = await Promise.all([
          safe("sleep", date, () => client.getDailySleep(date)),
          safe("hrv", date, () => client.getHrv(date)),
          safe("daily-heart-rate", date, () => client.getDailyHeartRate(date)),
          safe("spo2", date, () => client.getSpo2(date)),
        ]);

        for (const result of [sleep, hrv, heartRate, spo2]) {
          if (!result.ok) errors.push(result.error);
        }

        return {
          date,
          sleep: sleep.ok ? sleep.value : undefined,
          hrv: hrv.ok ? hrv.value : undefined,
          dailyHeartRate: heartRate.ok ? heartRate.value : undefined,
          spo2: spo2.ok ? spo2.value : undefined,
        };
      });

      const dated = (key: "sleep" | "hrv" | "dailyHeartRate" | "spo2"): DatedGarminRaw[] =>
        daily.flatMap((entry) =>
          entry[key] === undefined ? [] : [{ date: entry.date, raw: entry[key] }],
        );

      const metrics: DailyMetrics[] = buildGarminDailyMetrics({
        userId,
        fetchedAt,
        summaries: summariesRaw,
        sleep: dated("sleep"),
        hrv: dated("hrv"),
        bodyBattery: bodyBatteryRaw,
        dailyHeartRate: dated("dailyHeartRate"),
        spo2: dated("spo2"),
        weight: weightRaw,
      });

      await upsertActivities(db, activities);
      await upsertDailyMetrics(db, metrics);

      const status = errors.length > 0 ? "partial" : "ok";
      const syncedAt = new Date().toISOString();

      await finishSyncRun(db, runId, {
        status,
        stats: { activities: activities.length, metrics: metrics.length, errors },
      });
      await updateSyncState(db, {
        userId,
        provider,
        lastSyncAt: syncedAt,
        status,
        error: errors[0],
      });

      return {
        status,
        from,
        to,
        days: syncDays,
        activities: activities.length,
        metrics: metrics.length,
        errors,
        syncedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      const failedAt = new Date().toISOString();

      await finishSyncRun(db, runId, {
        status: "error",
        stats: { activities: 0, metrics: 0, errors },
        error: message,
      }).catch(() => undefined);
      await updateSyncState(db, {
        userId,
        provider,
        lastSyncAt: failedAt,
        status: "error",
        error: message,
      }).catch(() => undefined);

      throw new ServiceUnavailableException(message);
    }
  }

  async analyzeActivity(activityId: string): Promise<ActivityAnalysis> {
    const db = await this.db();
    const userId = PERSONAL_USER_ID;
    const activity = await getActivityByExternalId(db, userId, GARMIN_PROVIDER, activityId);
    const zip = await this.garmin.getClient().downloadActivity(activityId);

    const analysis = await parseGarminActivityZip(new Uint8Array(zip), {
      userId,
      externalId: activityId,
      source: GARMIN_PROVIDER,
      localDate: activity?.localDate,
      fetchedAt: new Date().toISOString(),
    });

    await upsertActivityAnalysis(db, analysis);
    return analysis;
  }

  async getActivityAnalysis(activityId: string): Promise<ActivityAnalysis | null> {
    const db = await this.db();
    return getStoredActivityAnalysis(db, PERSONAL_USER_ID, GARMIN_PROVIDER, activityId);
  }

  async overview(days = 7): Promise<GarminOverview> {
    const windowDays = Math.min(30, Math.max(1, Math.trunc(days)));
    const db = await this.db();
    const userId = PERSONAL_USER_ID;
    const provider = GARMIN_PROVIDER;

    const [state, activities, metrics, totalActivities, totalMetrics] = await Promise.all([
      getSyncState(db, userId, provider),
      getRecentActivities(db, userId, 10),
      getRecentDailyMetricsBySource(db, userId, provider, windowDays),
      countActivities(db, userId),
      countDailyMetricsBySource(db, userId, provider),
    ]);

    return {
      configured: this.garmin.isConfigured(),
      lastSync: state?.lastSyncAt ?? null,
      status: state?.status ?? "never",
      error: state?.error ?? null,
      counts: { activities: totalActivities, metrics: totalMetrics },
      activities: activities.map((activity) => ({
        id: activity.externalId,
        date: activity.localDate,
        sport: activity.sport,
        title: activity.title ?? null,
        durationMin: Math.round(activity.durationSec / 60),
        distanceKm:
          activity.distanceM !== undefined ? Number((activity.distanceM / 1000).toFixed(2)) : null,
        avgHr: activity.avgHr ?? null,
      })),
      metrics: metrics.map((entry) => ({
        date: entry.date,
        restingHr: entry.restingHr ?? null,
        hrvAvgMs: entry.hrvAvgMs ?? null,
        sleepMinutes: entry.sleepMinutes ?? null,
        steps: entry.steps ?? null,
        stressAvg: entry.stressAvg ?? null,
        bodyBatteryEnd: entry.bodyBatteryEnd ?? null,
      })),
    };
  }
}
