export {
  countActivities,
  getActivitiesForCapacity,
  getActivityByExternalId,
  getRecentActivities,
  upsertActivities,
} from "./activities";
export {
  getActivityAnalysis,
  getRecentActivityAnalyses,
  upsertActivityAnalysis,
} from "./activity-analyses";
export {
  deleteUserData,
  exportUserData,
  restoreUserData,
  type UserDataBackup,
} from "./backup";
export {
  getBaselineHistory,
  getCurrentBaseline,
  type NewBaseline,
  saveBaseline,
} from "./baselines";
export {
  getCheckin,
  getCheckinsInRange,
  getRecentCheckins,
  type StoredCheckin,
  saveCheckin,
} from "./checkins";
export { COLLECTIONS, ensureIndexes } from "./collections";
export {
  deleteCredentials,
  getCredentialsByEmail,
  getCredentialsByUserId,
  type StoredCredentials,
  saveCredentials,
} from "./credentials";
export {
  countDailyMetrics,
  countDailyMetricsBySource,
  getRecentDailyMetrics,
  getRecentDailyMetricsBySource,
  upsertDailyMetrics,
} from "./daily-metrics";
export {
  connectMongo,
  type MongoConnection,
  type MongoPingResult,
  pingMongo,
} from "./mongo";
export {
  countNutrition,
  getRecentNutrition,
  upsertNutrition,
} from "./nutrition";
export {
  getCurrentMacroPlan,
  getCurrentMicroPlan,
  getMicroPlan,
  replacePlannedSession,
  type StoredMacroPlan,
  type StoredMicroPlan,
  saveMacroPlan,
  saveMicroPlan,
  supersedeMacroPlans,
  updatePlannedSession,
} from "./plans";
export {
  getLatestReview,
  getReviewForWeek,
  getReviewsHistory,
  type StoredReview,
  saveReview,
} from "./reviews";
export {
  finishSyncRun,
  getSyncState,
  type SyncRun,
  type SyncState,
  type SyncStats,
  type SyncStatus,
  startSyncRun,
  updateSyncState,
} from "./sync";
export {
  countUsers,
  getUserByEmail,
  getUserById,
  upsertUser,
} from "./users";
