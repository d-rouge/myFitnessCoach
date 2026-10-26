import {
  countDailyMetricsBySource,
  countNutrition,
  finishSyncRun,
  getRecentDailyMetricsBySource,
  getRecentNutrition,
  getSyncState,
  startSyncRun,
  updateSyncState,
  upsertDailyMetrics,
  upsertNutrition,
} from "@health-trainer/db";
import type { DailyMetrics, NutritionDaily } from "@health-trainer/domain";
import { mapYazioDailySummary, mapYazioWeight } from "@health-trainer/integrations";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PERSONAL_USER_ID } from "../config/constants.js";
import { MongoService } from "../database/mongo.service.js";
import { YazioService } from "./yazio.service.js";

const YAZIO_PROVIDER = "yazio";

export interface YazioSyncResult {
  status: "ok" | "partial";
  from: string;
  to: string;
  days: number;
  nutritionDays: number;
  weightEntries: number;
  errors: string[];
  syncedAt: string;
}

export interface YazioDayDto {
  date: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterMl: number | null;
  steps: number | null;
  weightKg: number | null;
  goalKcal: number | null;
}

export interface YazioOverview {
  configured: boolean;
  lastSync: string | null;
  status: "never" | "running" | "ok" | "partial" | "error";
  error: string | null;
  counts: { days: number; weightEntries: number };
  days: YazioDayDto[];
}

type SafeResult<T> = { ok: true; value: T } | { ok: false; error: string };

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const todayIso = (): string => isoDay(new Date());

const daysAgoIso = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDay(date);
};

const eachDate = (from: string, to: string): string[] => {
  const dates: string[] = [];
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  while (current <= end) {
    dates.push(isoDay(current));
    current.setUTCDate(current.getUTCDate() + 1);
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

const mergeMetrics = (existing: DailyMetrics | undefined, next: DailyMetrics): DailyMetrics => {
  if (!existing) return next;
  const merged = { ...existing };
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
};

@Injectable()
export class YazioSyncService {
  constructor(
    private readonly yazio: YazioService,
    private readonly mongo: MongoService,
  ) {}

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async sync(days = 7): Promise<YazioSyncResult> {
    const syncDays = Math.min(30, Math.max(1, Math.trunc(days)));
    const db = await this.db();
    const userId = PERSONAL_USER_ID;
    const provider = YAZIO_PROVIDER;
    const to = todayIso();
    const from = daysAgoIso(syncDays - 1);
    const fetchedAt = new Date().toISOString();
    const errors: string[] = [];

    const runId = await startSyncRun(db, {
      userId,
      provider,
      startedAt: fetchedAt,
      stats: { activities: 0, metrics: 0, errors: [] },
    });

    try {
      const client = this.yazio.getClient();
      const dates = eachDate(from, to);

      const results = await mapLimit(dates, 2, async (date) => {
        const [summary, weight] = await Promise.all([
          safe("daily-summary", date, () => client.getDailySummary(date)),
          safe("weight", date, () => client.getWeight(date)),
        ]);

        for (const result of [summary, weight]) {
          if (!result.ok) errors.push(result.error);
        }

        return {
          date,
          summary: summary.ok ? summary.value : undefined,
          weight: weight.ok ? weight.value : undefined,
        };
      });

      const nutrition: NutritionDaily[] = [];
      const metricsByDate = new Map<string, DailyMetrics>();
      let weightEntries = 0;

      for (const result of results) {
        if (result.summary !== undefined) {
          const mapped = mapYazioDailySummary(result.summary, {
            userId,
            date: result.date,
            fetchedAt,
          });
          if (mapped) {
            nutrition.push(mapped.nutrition);
            if (mapped.metrics) {
              metricsByDate.set(
                mapped.metrics.date,
                mergeMetrics(metricsByDate.get(mapped.metrics.date), mapped.metrics),
              );
            }
          }
        }

        if (result.weight !== undefined) {
          const mapped = mapYazioWeight(result.weight, {
            userId,
            date: result.date,
            fetchedAt,
          });
          if (mapped) {
            weightEntries += 1;
            metricsByDate.set(mapped.date, mergeMetrics(metricsByDate.get(mapped.date), mapped));
          }
        }
      }

      const metrics = [...metricsByDate.values()];
      await upsertNutrition(db, nutrition);
      await upsertDailyMetrics(db, metrics);

      const status = errors.length > 0 ? "partial" : "ok";
      const syncedAt = new Date().toISOString();

      await finishSyncRun(db, runId, {
        status,
        stats: {
          activities: 0,
          metrics: metrics.length,
          nutrition: nutrition.length,
          weightEntries,
          errors,
        },
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
        nutritionDays: nutrition.length,
        weightEntries,
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

  async overview(days = 7): Promise<YazioOverview> {
    const windowDays = Math.min(30, Math.max(1, Math.trunc(days)));
    const db = await this.db();
    const userId = PERSONAL_USER_ID;
    const provider = YAZIO_PROVIDER;

    const [state, nutrition, metrics, totalDays, totalWeight] = await Promise.all([
      getSyncState(db, userId, provider),
      getRecentNutrition(db, userId, windowDays),
      getRecentDailyMetricsBySource(db, userId, provider, windowDays),
      countNutrition(db, userId),
      countDailyMetricsBySource(db, userId, provider),
    ]);

    const weightByDate = new Map(
      metrics
        .filter((entry) => entry.weightKg !== undefined)
        .map((entry) => [entry.date, entry.weightKg as number]),
    );

    return {
      configured: this.yazio.isConfigured(),
      lastSync: state?.lastSyncAt ?? null,
      status: state?.status ?? "never",
      error: state?.error ?? null,
      counts: { days: totalDays, weightEntries: totalWeight },
      days: nutrition.map((entry) => ({
        date: entry.date,
        kcal: entry.kcal ?? null,
        proteinG: entry.proteinG ?? null,
        carbsG: entry.carbsG ?? null,
        fatG: entry.fatG ?? null,
        waterMl: entry.waterMl ?? null,
        steps: entry.steps ?? null,
        weightKg: entry.weightKg ?? weightByDate.get(entry.date) ?? null,
        goalKcal: entry.goalKcal ?? null,
      })),
    };
  }
}
