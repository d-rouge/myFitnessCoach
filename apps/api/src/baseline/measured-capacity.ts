import {
  type Baseline,
  type CapacityActivity,
  estimateCapacityFromActivities,
  preserveDeclaredFiveK,
  primarySportOf,
  withDerivedExperienceTier,
} from "@health-trainer/domain";

/**
 * Fills the capacity that the stored document cannot know.
 *
 * `garmin` and `calibration` both declare that the numbers in the document are
 * not the truth: the first is measured from activities, the second is a
 * promise until the first real data arrives. Applying the same rule on read and
 * on plan generation is what keeps the wizard, the dashboard and the plan
 * saying the same thing.
 *
 * Returns the baseline untouched when the athlete entered the numbers by hand
 * or when there is nothing to measure yet.
 */
export function withMeasuredCapacity(
  baseline: Baseline,
  activities: readonly CapacityActivity[],
  now: string,
): Baseline {
  const source = baseline.profile.capacity.source;
  if (source !== "garmin" && source !== "calibration") return baseline;
  if (activities.length === 0) return baseline;

  const estimate = estimateCapacityFromActivities(activities, {
    now,
    sport: primarySportOf(baseline),
    timezone: baseline.profile.timezone,
  });
  if (!estimate.available) return baseline;

  return withDerivedExperienceTier({
    ...baseline,
    profile: {
      ...baseline.profile,
      // Il tempo 5K dichiarato sopravvive al ricalcolo: è un dato che l'atleta
      // conosce (es. la race prediction di Garmin), non una stima da rifare.
      capacity: preserveDeclaredFiveK(estimate.capacity, baseline.profile.capacity),
    },
  });
}
