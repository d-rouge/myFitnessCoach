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
import {
  addDaysIso,
  type DailyMetrics,
  DailyMetricsSchema,
  type NutritionDaily,
  NutritionDailySchema,
  todayLocalDate,
} from "@health-trainer/domain";
import {
  mapYazioDailyNutrients,
  mapYazioDailySummary,
  mapYazioGoals,
  mapYazioSummaryExtras,
  mapYazioWeight,
} from "@health-trainer/integrations";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { getUserTimeZone } from "../common/user-timezone.js";
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

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

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

  async sync(userId: string, days = 7): Promise<YazioSyncResult> {
    const syncDays = Math.min(30, Math.max(1, Math.trunc(days)));
    const db = await this.db();
    const provider = YAZIO_PROVIDER;
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
      const client = this.yazio.getClient();
      const dates = eachDate(from, to);

      const mergeNutrition = (
        base: NutritionDaily | undefined,
        patch: Partial<NutritionDaily> | undefined,
      ): NutritionDaily | undefined => {
        if (!patch) return base;
        const date = patch.date ?? base?.date;
        if (!date) return base;

        const merged = {
          ...(base ?? { userId, date, source: "yazio", fetchedAt }),
          ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
        };
        const parsed = NutritionDailySchema.safeParse(merged);
        return parsed.success ? parsed.data : base;
      };

      const nutrientsResult = await safe("nutrients-daily", `${from}..${to}`, () =>
        client.getDailyNutrients(from, to),
      );
      if (!nutrientsResult.ok) errors.push(nutrientsResult.error);

      const nutritionByDate = new Map<string, NutritionDaily>();

      for (const entry of nutrientsResult.ok ? asArray(nutrientsResult.value) : []) {
        const mapped = mapYazioDailyNutrients(entry, {
          userId,
          date: from,
          fetchedAt,
        });
        if (mapped) nutritionByDate.set(mapped.date, mapped);
      }

      const results = await mapLimit(dates, 2, async (date) => {
        const [summary, weight, goals] = await Promise.all([
          safe("daily-summary", date, () => client.getDailySummary(date)),
          safe("weight", date, () => client.getWeight(date)),
          safe("goals", date, () => client.getGoals(date)),
        ]);

        for (const result of [summary, weight, goals]) {
          if (!result.ok) errors.push(result.error);
        }

        return {
          date,
          summary: summary.ok ? summary.value : undefined,
          weight: weight.ok ? weight.value : undefined,
          goals: goals.ok ? goals.value : undefined,
        };
      });

      const metricsByDate = new Map<string, DailyMetrics>();
      let weightEntries = 0;

      for (const result of results) {
        if (result.summary !== undefined) {
          const summaryExtras = mapYazioSummaryExtras(result.summary, {
            userId,
            date: result.date,
            fetchedAt,
          });
          const goalsExtras = result.goals
            ? mapYazioGoals(result.goals, { userId, date: result.date, fetchedAt })
            : undefined;
          const extras = summaryExtras ? { ...summaryExtras, ...(goalsExtras ?? {}) } : goalsExtras;

          if (extras) {
            const existing = nutritionByDate.get(result.date);
            if (!existing || existing.kcal === undefined) {
              const fallback = mapYazioDailySummary(result.summary, {
                userId,
                date: result.date,
                fetchedAt,
              });
              const merged = mergeNutrition(fallback?.nutrition, extras);
              if (merged) nutritionByDate.set(merged.date, merged);
            } else {
              const merged = mergeNutrition(existing, extras);
              if (merged) nutritionByDate.set(merged.date, merged);
            }

            const metricsCandidate = {
              userId,
              date: result.date,
              source: "yazio",
              steps: extras.steps,
              hydrationMl: extras.waterMl,
              weightKg: extras.weightKg,
              fetchedAt,
            };
            const parsedMetrics = DailyMetricsSchema.safeParse(metricsCandidate);
            if (
              parsedMetrics.success &&
              (extras.steps !== undefined ||
                extras.waterMl !== undefined ||
                extras.weightKg !== undefined)
            ) {
              metricsByDate.set(
                result.date,
                mergeMetrics(metricsByDate.get(result.date), parsedMetrics.data),
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

      const nutrition = [...nutritionByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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

  async overview(userId: string, days = 7): Promise<YazioOverview> {
    const windowDays = Math.min(30, Math.max(1, Math.trunc(days)));
    const db = await this.db();
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
