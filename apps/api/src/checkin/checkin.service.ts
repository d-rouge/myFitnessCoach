import { getCheckin, saveCheckin } from "@health-trainer/db";
import {
  type Checkin,
  CheckinSchema,
  computeDailyAdjustment,
  type DailyAdjustmentResult,
} from "@health-trainer/domain";
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MongoService } from "../database/mongo.service.js";
import { PlanService } from "../plan/plan.service.js";

@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    private readonly mongo: MongoService,
    private readonly planService: PlanService,
  ) {}

  private async db() {
    return this.mongo.getDb().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `MongoDB non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async saveCheckin(
    userId: string,
    input: unknown,
  ): Promise<{ checkin: Checkin; adjustment?: DailyAdjustmentResult }> {
    const parsed = CheckinSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(
        `Check-in non valido: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      );
    }

    const checkin = parsed.data;
    const db = await this.db();
    await saveCheckin(db, userId, checkin);

    this.logger.log(
      `Check-in ${checkin.type} salvato per atleta ${userId} in data ${checkin.date}`,
    );

    let adjustment: DailyAdjustmentResult | undefined;

    if (checkin.type === "morning") {
      const todayInfo = await this.planService.getTodaySession(userId);
      adjustment = computeDailyAdjustment({
        checkin,
        session: todayInfo.session,
      });

      // If adaptation changed the session, update the session in the micro plan
      if (todayInfo.session && adjustment.adjustedSession && adjustment.decision !== "confirm") {
        await this.planService.updateSession(userId, todayInfo.session.id, {
          status: "adjusted",
          notes: `Adattamento automatico (${adjustment.decision}): ${adjustment.changes.join("; ")}`,
        });
      }
    }

    return { checkin, adjustment };
  }

  async getTodayCheckin(userId: string): Promise<{
    date: string;
    morning: Checkin | null;
    postSession: Checkin | null;
  }> {
    const db = await this.db();
    const today = new Date().toISOString().slice(0, 10);

    const [morning, postSession] = await Promise.all([
      getCheckin(db, userId, today, "morning"),
      getCheckin(db, userId, today, "post_session"),
    ]);

    return { date: today, morning, postSession };
  }
}
