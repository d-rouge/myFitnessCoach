import {
  type ActivityAnalysis,
  ActivityAnalysisSchema,
  type ActivitySplit,
  ActivitySplitSchema,
  type ActivityZone,
  type Sport,
} from "@health-trainer/domain";
import { unzipSync } from "fflate";
import FitParser from "fit-file-parser";

type RawRecord = Record<string, unknown>;

export interface FitActivityOptions {
  userId: string;
  externalId: string;
  source?: string;
  localDate?: string;
  fetchedAt: string;
}

const asRecord = (value: unknown): RawRecord | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : undefined;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const positive = (value: unknown): number | undefined => {
  const parsed = num(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
};

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const toIso = (value: unknown): string | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
};

const paceFromSpeed = (speedMps: number | undefined): number | undefined =>
  speedMps !== undefined && speedMps > 0 ? Math.round(1000 / speedMps) : undefined;

const mapSport = (sport: string | undefined, subSport: string | undefined): Sport => {
  const key = `${sport ?? ""} ${subSport ?? ""}`.toLowerCase();
  if (/run|jog|trail/.test(key)) return "running";
  if (/cycl|bik|ride/.test(key)) return "cycling";
  if (/swim/.test(key)) return "swimming";
  if (/strength|weight/.test(key)) return "strength";
  if (/yoga|pilates|mobility|stretch/.test(key)) return "mobility";
  return "other";
};

const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

const formatPace = (secondsPerKm: number | undefined): string | undefined => {
  if (secondsPerKm === undefined) return undefined;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
};

const formatSpeed = (speedMps: number | undefined): string | undefined =>
  speedMps === undefined ? undefined : `${(speedMps * 3.6).toFixed(1)} km/h`;

const mean = (values: number[]): number | undefined =>
  values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;

const round = (value: number | undefined, decimals = 1): number | undefined =>
  value === undefined ? undefined : Number(value.toFixed(decimals));

const mapLaps = (parsed: RawRecord): ActivitySplit[] =>
  asArray(parsed.laps).flatMap((entry, position) => {
    const lap = asRecord(entry);
    if (!lap) return [];

    const durationSec = num(lap.total_timer_time) ?? num(lap.total_elapsed_time) ?? 0;
    const distanceM = num(lap.total_distance);
    const avgSpeedMps = num(lap.enhanced_avg_speed) ?? num(lap.avg_speed);
    const messageIndex = asRecord(lap.message_index);

    const candidate = {
      index: num(messageIndex?.value) ?? position,
      durationSec,
      distanceM,
      avgHr: positive(lap.avg_heart_rate),
      maxHr: positive(lap.max_heart_rate),
      avgPower: num(lap.avg_power),
      avgPaceSecKm: paceFromSpeed(avgSpeedMps),
      avgSpeedMps,
      ascentM: num(lap.total_ascent),
      calories: num(lap.total_calories),
      intensity: str(lap.intensity),
      trigger: str(lap.lap_trigger),
    };

    const parsedLap = ActivitySplitSchema.safeParse(candidate);
    return parsedLap.success ? [parsedLap.data] : [];
  });

const mapSplits = (parsed: RawRecord): ActivitySplit[] =>
  asArray(parsed.splits).flatMap((entry, position) => {
    const split = asRecord(entry);
    if (!split) return [];

    const durationSec = num(split.total_timer_time) ?? num(split.total_elapsed_time) ?? 0;
    const distanceM = num(split.total_distance);
    const avgSpeedMps = num(split.avg_speed);
    const messageIndex = asRecord(split.message_index);

    const candidate = {
      index: num(messageIndex?.value) ?? position,
      durationSec,
      distanceM,
      avgPaceSecKm: paceFromSpeed(avgSpeedMps),
      avgSpeedMps,
      ascentM: num(split.total_ascent),
      calories: num(split.total_calories),
      trigger: str(split.split_type),
    };

    const parsedSplit = ActivitySplitSchema.safeParse(candidate);
    return parsedSplit.success ? [parsedSplit.data] : [];
  });

const mapHrZones = (
  parsed: RawRecord,
  maxHr: number | undefined,
  records: RawRecord[],
  durationSec: number,
): ActivityZone[] => {
  const zoneMessages = asArray(parsed.time_in_zone)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is RawRecord => entry !== undefined);
  const sessionZone =
    zoneMessages.find((entry) => str(entry.reference_mesg) === "session") ?? zoneMessages[0];

  const times = asArray(sessionZone?.time_in_hr_zone)
    .map((value) => num(value))
    .filter((value): value is number => value !== undefined && value > 0);

  if (times.length > 0) {
    return times.map((seconds, index) => ({
      zone: index + 1,
      minutes: Number((seconds / 60).toFixed(1)),
    }));
  }

  const hrValues = records
    .map((record) => positive(record.heart_rate))
    .filter((value): value is number => value !== undefined);

  if (maxHr === undefined || hrValues.length === 0) return [];

  const thresholds = [0.5, 0.6, 0.7, 0.8, 0.9];
  const counts = [0, 0, 0, 0, 0];
  for (const hr of hrValues) {
    const ratio = hr / maxHr;
    let zone = 5;
    for (let index = thresholds.length - 1; index >= 0; index -= 1) {
      if (ratio >= (thresholds[index] ?? 1)) {
        zone = index + 1;
        break;
      }
    }
    counts[zone - 1] = (counts[zone - 1] ?? 0) + 1;
  }

  const secondsPerSample = durationSec / Math.max(1, hrValues.length);
  return counts
    .map((count, index) => ({
      zone: index + 1,
      minutes: Number(((count * secondsPerSample) / 60).toFixed(1)),
    }))
    .filter((zone) => zone.minutes > 0);
};

const paceForSplits = (splits: ActivitySplit[]): number | undefined => {
  const distance = splits.reduce((sum, split) => sum + (split.distanceM ?? 0), 0);
  const duration = splits.reduce((sum, split) => sum + split.durationSec, 0);
  return distance > 0 && duration > 0 ? duration / (distance / 1000) : undefined;
};

const selectSplitsForBrief = (splits: ActivitySplit[]): ActivitySplit[] => {
  if (splits.length <= 15) return splits;

  const byIndex = new Map<number, ActivitySplit>();
  for (const split of splits.slice(0, 5)) byIndex.set(split.index, split);
  for (const split of splits.slice(-5)) byIndex.set(split.index, split);

  const withPace = splits.filter((split) => split.avgPaceSecKm !== undefined);
  const best = [...withPace].sort((a, b) => (a.avgPaceSecKm ?? 0) - (b.avgPaceSecKm ?? 0))[0];
  const worst = [...withPace].sort((a, b) => (b.avgPaceSecKm ?? 0) - (a.avgPaceSecKm ?? 0))[0];
  if (best) byIndex.set(best.index, best);
  if (worst) byIndex.set(worst.index, worst);

  return [...byIndex.values()].sort((a, b) => a.index - b.index);
};

const buildBrief = (
  sport: Sport,
  date: string,
  summary: ActivityAnalysis["summary"],
  splits: ActivitySplit[],
  zones: ActivityZone[],
  derived: ActivityAnalysis["derived"],
): string => {
  const lines: string[] = ["## Attività", `- Sport: ${sport}`, `- Data: ${date}`];
  lines.push(`- Durata: ${formatDuration(summary.durationSec)}`);
  if (summary.movingSec !== undefined) {
    lines.push(`- Tempo in movimento: ${formatDuration(summary.movingSec)}`);
  }
  if (summary.distanceM !== undefined) {
    lines.push(`- Distanza: ${(summary.distanceM / 1000).toFixed(2)} km`);
  }

  if (sport === "running") {
    const pace = formatPace(summary.avgPaceSecKm);
    if (pace) lines.push(`- Passo medio: ${pace}`);
  } else if (sport === "cycling") {
    const speed = formatSpeed(summary.avgSpeedMps);
    if (speed) lines.push(`- Velocità media: ${speed}`);
  }

  if (summary.avgHr !== undefined) {
    lines.push(
      `- HR: ${Math.round(summary.avgHr)}${summary.maxHr !== undefined ? ` / ${Math.round(summary.maxHr)}` : ""} bpm`,
    );
  }
  if (summary.avgPower !== undefined) {
    lines.push(
      `- Potenza: ${Math.round(summary.avgPower)} W${summary.normalizedPower !== undefined ? ` (NP ${Math.round(summary.normalizedPower)} W)` : ""}`,
    );
  }
  if (summary.avgCadence !== undefined) {
    lines.push(`- Cadenza: ${Math.round(summary.avgCadence)} spm`);
  }
  if (summary.ascentM !== undefined || summary.descentM !== undefined) {
    lines.push(
      `- Dislivello: +${Math.round(summary.ascentM ?? 0)} / -${Math.round(summary.descentM ?? 0)} m`,
    );
  }
  if (summary.calories !== undefined) {
    lines.push(`- Calorie: ${Math.round(summary.calories)} kcal`);
  }
  if (summary.trainingEffect !== undefined) {
    lines.push(
      `- Training effect: ${summary.trainingEffect.toFixed(1)}${summary.anaerobicTrainingEffect !== undefined ? ` (anaerobico ${summary.anaerobicTrainingEffect.toFixed(1)})` : ""}`,
    );
  }
  if (summary.trainingLoad !== undefined) {
    lines.push(`- Training load: ${Math.round(summary.trainingLoad)}`);
  }

  if (splits.length > 0) {
    lines.push("", "## Split");
    lines.push("| # | distanza | tempo | passo | HR |");
    lines.push("|---|---|---|---|---|");
    for (const split of selectSplitsForBrief(splits)) {
      lines.push(
        `| ${split.index + 1} | ${split.distanceM !== undefined ? `${(split.distanceM / 1000).toFixed(2)} km` : "—"} | ${formatDuration(split.durationSec)} | ${formatPace(split.avgPaceSecKm) ?? "—"} | ${split.avgHr !== undefined ? Math.round(split.avgHr) : "—"} |`,
      );
    }
  }

  if (zones.length > 0) {
    lines.push("", "## Zone HR");
    lines.push(zones.map((zone) => `Z${zone.zone}: ${zone.minutes.toFixed(0)} min`).join(" · "));
  }

  const observations: string[] = [];
  if (derived.negativeSplit !== undefined) {
    observations.push(`- Negative split: ${derived.negativeSplit ? "sì" : "no"}`);
  }
  if (derived.paceVariabilityPct !== undefined) {
    observations.push(`- Variabilità passo: ${derived.paceVariabilityPct.toFixed(1)}%`);
  }
  if (derived.hrDriftPct !== undefined) {
    observations.push(
      `- Deriva HR: ${derived.hrDriftPct > 0 ? "+" : ""}${derived.hrDriftPct.toFixed(1)}%`,
    );
  }
  if (derived.bestSplitPaceSecKm !== undefined) {
    observations.push(`- Miglior split: ${formatPace(derived.bestSplitPaceSecKm)}`);
  }
  if (derived.worstSplitPaceSecKm !== undefined) {
    observations.push(`- Peggiore split: ${formatPace(derived.worstSplitPaceSecKm)}`);
  }
  if (derived.elevationPerKm !== undefined) {
    observations.push(`- Dislivello per km: ${derived.elevationPerKm.toFixed(1)} m/km`);
  }

  if (observations.length > 0) {
    lines.push("", "## Osservazioni", ...observations);
  }

  return lines.join("\n");
};

export async function parseFitFile(buffer: Uint8Array): Promise<RawRecord> {
  const parser = new FitParser({
    mode: "list",
    lengthUnit: "m",
    speedUnit: "m/s",
  });

  return (await parser.parseAsync(Buffer.from(buffer))) as RawRecord;
}

export function unzipFit(buffer: Uint8Array): Uint8Array {
  const files = unzipSync(buffer);
  const name = Object.keys(files).find((file) => file.toLowerCase().endsWith(".fit"));
  if (!name) {
    throw new Error(`FIT non trovato nello ZIP: ${Object.keys(files).join(", ")}`);
  }
  const bytes = files[name];
  if (!bytes || bytes.byteLength === 0) throw new Error("File FIT vuoto");
  return bytes;
}

export function extractFitActivity(
  parsed: RawRecord,
  options: FitActivityOptions,
): ActivityAnalysis {
  const sessions = asArray(parsed.sessions ?? parsed.session);
  const session = asRecord(sessions[0] ?? parsed.session);
  if (!session) throw new Error("FIT senza messaggio session");

  const records = asArray(parsed.records)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is RawRecord => entry !== undefined);

  const startTime = toIso(session.start_time);
  const date = options.localDate ?? startTime?.slice(0, 10) ?? options.fetchedAt.slice(0, 10);
  const sport = mapSport(str(session.sport), str(session.sub_sport));

  const durationSec = num(session.total_timer_time) ?? num(session.total_elapsed_time) ?? 0;
  const movingSec = num(session.total_timer_time);
  const distanceM = num(session.total_distance);
  const avgSpeedMps = num(session.enhanced_avg_speed) ?? num(session.avg_speed);
  const avgHr = positive(session.avg_heart_rate);
  const maxHr = positive(session.max_heart_rate);

  const laps = mapLaps(parsed);
  const rawSplits = mapSplits(parsed);
  const hrZones = mapHrZones(parsed, maxHr, records, durationSec);

  // FIT splits can include walk/stand segments and the whole activity.
  // Prefer distance laps (1 km on Garmin running) when available.
  const minSplitDistance = sport === "swimming" ? 50 : sport === "cycling" ? 1000 : 500;
  const isUsableSplit = (split: ActivitySplit): boolean =>
    split.durationSec >= 60 &&
    (split.distanceM ?? 0) >= minSplitDistance &&
    (distanceM === undefined || (split.distanceM ?? 0) < distanceM * 0.9);

  const eligibleLaps = laps.filter(isUsableSplit);
  const eligibleSplits = rawSplits.filter(
    (split) =>
      isUsableSplit(split) &&
      split.trigger !== "rwd_walk" &&
      split.trigger !== "rwd_stand" &&
      split.trigger !== "interval_active",
  );
  const splits = eligibleLaps.length >= 2 ? eligibleLaps : eligibleSplits;

  const cadenceMultiplier = sport === "running" ? 2 : 1;
  const summary = {
    durationSec,
    movingSec,
    distanceM,
    avgHr,
    maxHr,
    avgPower: num(session.avg_power),
    normalizedPower: num(session.normalized_power),
    avgPaceSecKm: paceFromSpeed(avgSpeedMps),
    avgSpeedMps,
    avgCadence:
      num(session.avg_cadence) !== undefined
        ? (num(session.avg_cadence) as number) * cadenceMultiplier
        : undefined,
    maxCadence:
      num(session.max_cadence) !== undefined
        ? (num(session.max_cadence) as number) * cadenceMultiplier
        : undefined,
    ascentM: num(session.total_ascent),
    descentM: num(session.total_descent),
    calories: num(session.total_calories),
    trainingEffect: num(session.total_training_effect),
    anaerobicTrainingEffect: num(session.total_anaerobic_training_effect),
    trainingLoad: num(session.training_load_peak),
    startTime,
  };

  const paces = splits
    .map((split) => split.avgPaceSecKm)
    .filter((pace): pace is number => pace !== undefined);
  const paceMean = mean(paces);
  const paceVariabilityPct =
    paceMean !== undefined && paceMean > 0 && paces.length >= 2
      ? round(
          (Math.sqrt(paces.reduce((sum, pace) => sum + (pace - paceMean) ** 2, 0) / paces.length) /
            paceMean) *
            100,
        )
      : undefined;

  const half = Math.floor(splits.length / 2);
  const firstPace = paceForSplits(splits.slice(0, half));
  const secondPace = paceForSplits(splits.slice(half));
  const negativeSplit =
    firstPace !== undefined && secondPace !== undefined ? secondPace < firstPace : undefined;

  const hrValues = records
    .map((record) => positive(record.heart_rate))
    .filter((value): value is number => value !== undefined);
  const hrHalf = Math.floor(hrValues.length / 2);
  const firstHr = mean(hrValues.slice(0, hrHalf));
  const secondHr = mean(hrValues.slice(hrHalf));
  const hrDriftPct =
    firstHr !== undefined && secondHr !== undefined && firstHr > 0
      ? round(((secondHr - firstHr) / firstHr) * 100)
      : undefined;

  const sortedPaces = [...paces].sort((a, b) => a - b);
  const derived = {
    paceVariabilityPct,
    hrDriftPct,
    negativeSplit,
    bestSplitPaceSecKm: sortedPaces[0],
    worstSplitPaceSecKm: sortedPaces.at(-1),
    elevationPerKm:
      summary.ascentM !== undefined && distanceM !== undefined && distanceM > 0
        ? round(summary.ascentM / (distanceM / 1000))
        : undefined,
  };

  const brief = buildBrief(sport, date, summary, splits, hrZones, derived);

  return ActivityAnalysisSchema.parse({
    userId: options.userId,
    externalId: options.externalId,
    source: options.source ?? "garmin",
    sport,
    date,
    summary,
    laps,
    splits,
    hrZones,
    derived,
    brief,
    parsedAt: options.fetchedAt,
  });
}

export async function parseGarminActivityZip(
  zip: Uint8Array,
  options: FitActivityOptions,
): Promise<ActivityAnalysis> {
  const fit = unzipFit(zip);
  const parsed = await parseFitFile(fit);
  return extractFitActivity(parsed, options);
}
