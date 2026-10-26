import {
  type Activity,
  ActivitySchema,
  type DailyMetrics,
  DailyMetricsSchema,
  type Sport,
} from "@health-trainer/domain";

type RawRecord = Record<string, unknown>;

export interface GarminMappingOptions {
  userId: string;
  fetchedAt: string;
}

export interface DatedGarminRaw {
  date: string;
  raw: unknown;
}

export interface GarminDailyMetricsInput extends GarminMappingOptions {
  summaries: unknown;
  sleep: DatedGarminRaw[];
  hrv: DatedGarminRaw[];
  bodyBattery: unknown;
  dailyHeartRate: DatedGarminRaw[];
  spo2: DatedGarminRaw[];
  weight: unknown;
}

const asRecord = (value: unknown): RawRecord | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : undefined;

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  for (const key of [
    "activityList",
    "data",
    "summaries",
    "dateWeightList",
    "weightList",
    "items",
  ]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
};

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const positive = (value: unknown): number | undefined => {
  const parsed = num(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
};

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const secondsToMinutes = (value: unknown): number | undefined => {
  const seconds = num(value);
  return seconds !== undefined && seconds >= 0 ? Math.round(seconds / 60) : undefined;
};

const toIso = (value: unknown): string | undefined => {
  const raw = str(value);
  if (!raw) return undefined;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const toDate = (value: unknown): string | undefined => {
  const raw = str(value);
  if (!raw) return undefined;
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : undefined;
};

export function mapGarminSport(typeKey: string | undefined): Sport {
  const key = (typeKey ?? "").toLowerCase();
  if (/run|jog|trail/.test(key)) return "running";
  if (/cycl|bik|bike|ride|virtual_ride/.test(key)) return "cycling";
  if (/swim/.test(key)) return "swimming";
  if (/strength|weight_train/.test(key)) return "strength";
  if (/yoga|pilates|mobility|stretch/.test(key)) return "mobility";
  return "other";
}

export function mapGarminActivities(raw: unknown, options: GarminMappingOptions): Activity[] {
  const activities: Activity[] = [];

  for (const entry of asArray(raw)) {
    const item = asRecord(entry);
    if (!item) continue;

    const activityType = asRecord(item.activityType);
    const externalId = str(item.activityId) ?? num(item.activityId)?.toString();
    const startLocal = str(item.startTimeLocal);
    const start = toIso(item.startTimeGMT) ?? toIso(item.startTimeLocal);
    const localDate = startLocal?.slice(0, 10) ?? (start ? start.slice(0, 10) : undefined);

    if (!externalId || !start || !localDate) continue;

    const durationSec = num(item.duration) ?? 0;
    const distanceM = num(item.distance);
    const avgPaceSecKm =
      distanceM !== undefined && distanceM > 0 && durationSec > 0
        ? Math.round(durationSec / (distanceM / 1000))
        : undefined;

    const candidate = {
      userId: options.userId,
      source: "garmin",
      externalId,
      sport: mapGarminSport(str(activityType?.typeKey)),
      start,
      localDate,
      durationSec,
      distanceM,
      avgHr: positive(item.averageHR),
      maxHr: positive(item.maxHR),
      avgPower: num(item.avgPower),
      normalizedPower: num(item.normPower),
      avgSpeedMps: num(item.averageSpeed),
      avgPaceSecKm,
      elevationGainM: num(item.elevationGain),
      calories: num(item.calories),
      trainingEffect: num(item.aerobicTrainingEffect),
      activityLoad: num(item.activityTrainingLoad),
      title: str(item.activityName),
      fetchedAt: options.fetchedAt,
    };

    const parsed = ActivitySchema.safeParse(candidate);
    if (parsed.success) activities.push(parsed.data);
  }

  return activities;
}

function mapSummary(record: RawRecord): Partial<DailyMetrics> {
  const movement = asRecord(record.movement);
  const steps = asRecord(movement?.steps);
  const calories = asRecord(record.calories);
  const heartRate = asRecord(record.heartRate);
  const intensity = asRecord(record.intensityMinutes);
  const stress = asRecord(record.stress);
  const bodyBattery = asRecord(record.bodyBattery);
  const respiration = asRecord(record.respiration);

  return {
    restingHr: positive(heartRate?.restingValue),
    steps: num(steps?.value),
    stepGoal: num(steps?.goal),
    distanceM: num(steps?.distanceInMeters),
    caloriesResting: num(calories?.burnedResting),
    caloriesActive: num(calories?.burnedActive),
    caloriesTotal: num(calories?.burnedTotal),
    intensityModerateMin: num(intensity?.moderate),
    intensityVigorousMin: num(intensity?.vigorous),
    stressAvg: num(stress?.avgLevel),
    stressMax: num(stress?.maxLevel),
    bodyBatteryMin: num(bodyBattery?.minValue),
    bodyBatteryMax: num(bodyBattery?.maxValue),
    bodyBatteryEnd: num(bodyBattery?.latestValue),
    bodyBatteryCharged: num(bodyBattery?.chargedValue),
    bodyBatteryDrained: num(bodyBattery?.drainedValue),
    respirationAvg: num(respiration?.avgValue),
  };
}

function mapSleep(raw: unknown): Partial<DailyMetrics> {
  const record = asRecord(raw);
  if (!record) return {};
  const scores = asRecord(record.sleepScores);
  const overall = asRecord(scores?.overall);
  const need = asRecord(record.sleepNeed);

  return {
    sleepMinutes: secondsToMinutes(record.sleepTimeSeconds),
    deepSleepMin: secondsToMinutes(record.deepSleepSeconds),
    lightSleepMin: secondsToMinutes(record.lightSleepSeconds),
    remSleepMin: secondsToMinutes(record.remSleepSeconds),
    awakeMin: secondsToMinutes(record.awakeSleepSeconds),
    sleepScore: num(overall?.value),
    sleepNeedMin: num(need?.actual),
    sleepStressAvg: num(record.avgSleepStress),
    respirationAvg: num(record.averageRespirationValue),
  };
}

function mapHrv(raw: unknown): Partial<DailyMetrics> {
  const record = asRecord(raw);
  const summary = asRecord(record?.hrvSummary);
  return {
    hrvAvgMs: num(summary?.lastNightAvg),
    hrvWeeklyAvgMs: num(summary?.weeklyAvg),
    hrvStatus: str(summary?.status),
  };
}

function mapDailyHeartRate(raw: unknown): Partial<DailyMetrics> {
  const record = asRecord(raw);
  return {
    restingHr:
      positive(record?.restingHeartRate) ?? positive(record?.lastSevenDaysAvgRestingHeartRate),
  };
}

function mapSpo2(raw: unknown): Partial<DailyMetrics> {
  const record = asRecord(raw);
  return {
    spo2Avg: num(record?.averageSpO2),
    spo2Min: num(record?.lowestSpO2),
  };
}

function mapBodyBattery(record: RawRecord): Partial<DailyMetrics> {
  const values = asArray(record.bodyBatteryValuesArray)
    .map((entry) => {
      const pair = asArray(entry);
      return num(pair[1]) ?? num(pair[0]);
    })
    .filter((value): value is number => value !== undefined);

  return {
    bodyBatteryCharged: num(record.charged),
    bodyBatteryDrained: num(record.drained),
    bodyBatteryEnd: values.at(-1),
  };
}

function mapWeight(raw: unknown): { date: string; patch: Partial<DailyMetrics> } | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const date = toDate(record.date);
  if (!date) return undefined;
  return {
    date,
    patch: {
      weightKg: positive(record.weight),
      bodyFatPct: num(record.bodyFat),
    },
  };
}

const mergeDefined = (target: DailyMetrics, patch: Partial<DailyMetrics>): DailyMetrics => {
  const next = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value !== undefined &&
      key !== "userId" &&
      key !== "date" &&
      key !== "source" &&
      key !== "fetchedAt"
    ) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
};

const hasMetrics = (metrics: DailyMetrics): boolean =>
  Object.entries(metrics).some(
    ([key, value]) =>
      value !== undefined && !["userId", "date", "source", "fetchedAt"].includes(key),
  );

export function buildGarminDailyMetrics(input: GarminDailyMetricsInput): DailyMetrics[] {
  const byDate = new Map<string, DailyMetrics>();

  const upsert = (date: string | undefined, patch: Partial<DailyMetrics>) => {
    if (!date) return;
    const current = byDate.get(date) ?? {
      userId: input.userId,
      date,
      source: "garmin",
      fetchedAt: input.fetchedAt,
    };
    byDate.set(date, mergeDefined(current, patch));
  };

  // Body Battery is merged first so the daily summary's end-of-day value wins.
  for (const entry of asArray(input.bodyBattery)) {
    const record = asRecord(entry);
    if (!record) continue;
    upsert(toDate(record.date), mapBodyBattery(record));
  }

  for (const entry of asArray(input.summaries)) {
    const record = asRecord(entry);
    if (!record) continue;
    upsert(toDate(record.calendarDate), mapSummary(record));
  }

  for (const item of input.sleep) upsert(item.date, mapSleep(item.raw));
  for (const item of input.hrv) upsert(item.date, mapHrv(item.raw));
  for (const item of input.dailyHeartRate) upsert(item.date, mapDailyHeartRate(item.raw));
  for (const item of input.spo2) upsert(item.date, mapSpo2(item.raw));

  for (const entry of asArray(input.weight)) {
    const mapped = mapWeight(entry);
    if (mapped) upsert(mapped.date, mapped.patch);
  }

  return [...byDate.values()]
    .filter(hasMetrics)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((metrics) => {
      const parsed = DailyMetricsSchema.safeParse(metrics);
      return parsed.success ? [parsed.data] : [];
    });
}
