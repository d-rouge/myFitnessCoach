import {
  getCurrentMicroPlan,
  getRecentActivities,
  updatePlannedSession,
  upsertActivities,
} from "@health-trainer/db";
import {
  type Activity,
  compareSessionWithActivity,
  type PlannedSession,
  type SessionComparisonResult,
  type Sport,
} from "@health-trainer/domain";
import { extractFitActivity, parseFitFile } from "@health-trainer/integrations";
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MongoService } from "../database/mongo.service.js";

export interface ManualActivityInput {
  sessionId?: string;
  sport?: Sport;
  durationMin: number;
  distanceKm?: number;
  avgHr?: number;
  maxHr?: number;
  rpe?: number;
  notes?: string;
  date?: string;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly mongo: MongoService) {}

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async recordManualActivity(
    userId: string,
    input: ManualActivityInput,
  ): Promise<{ activity: Activity; comparison?: SessionComparisonResult }> {
    if (!input.durationMin || input.durationMin <= 0) {
      throw new BadRequestException("La durata in minuti deve essere positiva.");
    }

    const db = await this.db();
    const todayStr = input.date || new Date().toISOString().slice(0, 10);
    const microPlan = await getCurrentMicroPlan(db, userId);

    let session: PlannedSession | undefined;
    if (microPlan) {
      if (input.sessionId) {
        session = microPlan.sessions.find((s) => s.id === input.sessionId);
      } else {
        session = microPlan.sessions.find((s) => s.status !== "completed");
      }
    }

    let resolvedSport: Sport = input.sport || "other";
    if (!input.sport && session) {
      if (session.type === "run") resolvedSport = "running";
      else if (session.type === "cycle") resolvedSport = "cycling";
      else if (session.type === "swim") resolvedSport = "swimming";
      else if (session.type === "strength") resolvedSport = "strength";
      else if (session.type === "mobility") resolvedSport = "mobility";
    }

    const activity: Activity = {
      userId,
      source: "manual",
      externalId: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sport: resolvedSport,
      start: `${todayStr}T10:00:00.000Z`,
      localDate: todayStr,
      durationSec: Math.round(input.durationMin * 60),
      distanceM: input.distanceKm ? Math.round(input.distanceKm * 1000) : undefined,
      avgHr: input.avgHr,
      maxHr: input.maxHr,
      title: input.notes || `Sessione ${resolvedSport} manuale`,
      linkedSessionId: session?.id,
      fetchedAt: new Date().toISOString(),
    };

    let comparison: SessionComparisonResult | undefined;
    if (session) {
      comparison = compareSessionWithActivity(session, activity);
      await updatePlannedSession(db, userId, session.id, {
        status: "completed",
        notes: input.notes,
      });
    }

    await upsertActivities(db, [activity]);
    this.logger.log(
      `Attività manuale registrata per atleta ${userId}: ${resolvedSport} (${input.durationMin}m)`,
    );

    return { activity, comparison };
  }

  async recordFitUpload(
    userId: string,
    fileBuffer: Uint8Array,
    originalFilename = "upload.fit",
  ): Promise<{ activity: Activity; comparison?: SessionComparisonResult }> {
    const db = await this.db();
    const externalId = `fit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const parsedRaw = await parseFitFile(fileBuffer);
    const analysis = extractFitActivity(parsedRaw, {
      userId,
      externalId,
      source: "fit_upload",
      fetchedAt: new Date().toISOString(),
    });

    const microPlan = await getCurrentMicroPlan(db, userId);
    const session = microPlan?.sessions.find((s) => s.status !== "completed");

    const activity: Activity = {
      userId,
      source: "fit_upload",
      externalId,
      sport: analysis.sport,
      start: analysis.summary.startTime || `${analysis.date}T10:00:00.000Z`,
      localDate: analysis.date || new Date().toISOString().slice(0, 10),
      durationSec: analysis.summary.durationSec,
      distanceM: analysis.summary.distanceM,
      avgHr: analysis.summary.avgHr,
      maxHr: analysis.summary.maxHr,
      avgSpeedMps: analysis.summary.avgSpeedMps,
      elevationGainM: analysis.summary.ascentM,
      title: originalFilename,
      linkedSessionId: session?.id,
      fetchedAt: new Date().toISOString(),
    };

    let comparison: SessionComparisonResult | undefined;
    if (session) {
      comparison = compareSessionWithActivity(session, activity);
      await updatePlannedSession(db, userId, session.id, {
        status: "completed",
        notes: `Importato da ${originalFilename}`,
      });
    }

    await upsertActivities(db, [activity]);
    this.logger.log(`File FIT caricato e analizzato per atleta ${userId}: ${analysis.sport}`);

    return { activity, comparison };
  }

  async getRecentActivities(userId: string, limit = 10): Promise<Activity[]> {
    const db = await this.db();
    return getRecentActivities(db, userId, limit);
  }
}
