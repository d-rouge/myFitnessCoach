export {
  AuthExpiredError,
  InvalidResponseError,
  ProviderError,
  ProviderUnavailableError,
  RateLimitedError,
} from "./errors";
export {
  extractFitActivity,
  type FitActivityOptions,
  parseFitFile,
  parseGarminActivityZip,
  unzipFit,
} from "./fit/parser";
export {
  create5x800mWorkout,
  encodeSessionWorkoutFit,
  encodeWorkoutToFit,
  paceToSpeedMs,
  parsePaceStringToSecKm,
  sessionToWorkoutDef,
  type WorkoutDef,
  type WorkoutDuration,
  type WorkoutSport,
  type WorkoutStepDef,
  type WorkoutStepIntensity,
  type WorkoutTarget,
} from "./fit/workout-encoder";
export {
  buildGarminDailyMetrics,
  type DatedGarminRaw,
  type GarminDailyMetricsInput,
  type GarminMappingOptions,
  mapGarminActivities,
  mapGarminSport,
} from "./garmin/mapper";
export {
  type GarminActivitySearchParams,
  type GarminHealthCheck,
  type GarminJson,
  GarminPersonalClient,
  type GarminPersonalClientOptions,
  type GarminToken,
} from "./garmin/personal-client";
export {
  buildHevyRoutine,
  buildSampleFullBodyHevyRoutine,
  exportHevyRoutine,
  HEVY_EXERCISE_CATALOG,
  type HevyExercise,
  type HevyRoutinePayload,
  type HevySet,
} from "./hevy/routine-builder";
export type {
  ProviderAdapter,
  ProviderCapability,
  ProviderConnection,
  ProviderHealth,
} from "./provider";
export {
  YazioClient,
  type YazioClientOptions,
  type YazioCredentials,
  type YazioHealthCheck,
  type YazioJson,
  type YazioToken,
} from "./yazio/client";
export {
  mapYazioDailyNutrients,
  mapYazioDailySummary,
  mapYazioGoals,
  mapYazioSummaryExtras,
  mapYazioWeight,
  type YazioMappingOptions,
} from "./yazio/mapper";
