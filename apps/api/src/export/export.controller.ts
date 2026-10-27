import type { Env } from "@health-trainer/config";
import {
  deleteUserData,
  exportUserData,
  getCurrentMicroPlan,
  restoreUserData,
  type UserDataBackup,
} from "@health-trainer/db";
import type { User } from "@health-trainer/domain";
import {
  buildHevyRoutine,
  buildSampleFullBodyHevyRoutine,
  create5x800mWorkout,
  encodeSessionWorkoutFit,
  encodeWorkoutToFit,
  exportHevyRoutine,
} from "@health-trainer/integrations";
import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { APP_ENV } from "../config/env.module.js";
import { MongoService } from "../database/mongo.service.js";
import { type HevyExportInput, HevyExportSchema } from "./export.schemas.js";

@Controller("export")
export class ExportController {
  constructor(
    private readonly mongo: MongoService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  private async db() {
    return this.mongo.getDb();
  }

  @Get("workouts/sample-5x800m/info")
  getSampleWorkoutInfo() {
    const workout = create5x800mWorkout();
    return {
      name: workout.name,
      sport: workout.sport,
      description: workout.description,
      stepsCount: workout.steps.length,
      steps: workout.steps.map((s, idx) => ({
        index: idx,
        name: s.name,
        intensity: s.intensity,
        duration: s.duration,
        target: s.target,
        notes: s.notes,
      })),
    };
  }

  @Get("workouts/sample-5x800m.fit")
  @Header("Content-Type", "application/octet-stream")
  @Header("Content-Disposition", 'attachment; filename="5x800m-intervals.fit"')
  downloadSampleFitWorkout(@Res({ passthrough: true }) res: Response): StreamableFile {
    const workout = create5x800mWorkout();
    const fitBytes = encodeWorkoutToFit(workout);

    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="5x800m-intervals.fit"',
      "Content-Length": fitBytes.length.toString(),
    });

    return new StreamableFile(Buffer.from(fitBytes));
  }

  @Get("workouts/session/:sessionId.fit")
  async downloadSessionFitWorkout(
    @CurrentUser() user: User,
    @Param("sessionId") sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const db = await this.db();
    const microPlan = await getCurrentMicroPlan(db, user.id);

    if (!microPlan) {
      throw new NotFoundException("Nessun piano settimanale attivo trovato.");
    }

    const session = microPlan.sessions.find((s) => s.id === sessionId);
    if (!session) {
      throw new NotFoundException(`Sessione ${sessionId} non trovata nel piano attivo.`);
    }

    if (!["running", "cycling", "swimming"].includes(session.sport)) {
      throw new BadRequestException(
        `Export FIT non disponibile per lo sport "${session.sport}". Usa l'export Hevy per la palestra o scegli una sessione di corsa, bici o nuoto.`,
      );
    }

    const fitBytes = encodeSessionWorkoutFit(session);
    const safeTitle = session.title.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();

    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeTitle}.fit"`,
      "Content-Length": fitBytes.length.toString(),
    });

    return new StreamableFile(Buffer.from(fitBytes));
  }

  @Get("workouts/hevy/sample-fullbody.json")
  getSampleHevyRoutine() {
    return buildSampleFullBodyHevyRoutine();
  }

  @Post("workouts/hevy/export")
  async exportToHevy(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(HevyExportSchema)) body: HevyExportInput,
  ) {
    // Resolve and validate the session first: a non-strength or missing session
    // must fail with the real reason, not with a misleading "missing API key".
    const db = await this.db();
    const microPlan = await getCurrentMicroPlan(db, user.id);
    if (!microPlan) {
      throw new NotFoundException("Nessun piano settimanale attivo trovato.");
    }

    const session = body.sessionId
      ? microPlan.sessions.find((s) => s.id === body.sessionId)
      : microPlan.sessions.find((s) => s.type === "strength");

    if (!session) {
      throw new NotFoundException(
        body.sessionId
          ? `Sessione ${body.sessionId} non trovata nel piano attivo.`
          : "Nessuna sessione di forza trovata nel piano attivo.",
      );
    }

    if (session.sport !== "strength") {
      throw new BadRequestException(
        "L'export Hevy è disponibile solo per le sessioni di forza (palestra).",
      );
    }

    const apiKey = body.apiKey ?? this.env.HEVY_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        "Chiave API Hevy non configurata: imposta HEVY_API_KEY oppure inviala nella richiesta.",
      );
    }

    const payload = buildHevyRoutine(session);
    const result = await exportHevyRoutine(payload, apiKey);
    if (!result.success) {
      throw new BadGatewayException(result.message);
    }
    return result;
  }

  @Get("backup")
  async downloadBackup(@CurrentUser() user: User, @Res({ passthrough: true }) res: Response) {
    const db = await this.db();
    const backup = await exportUserData(db, user.id);

    res.set({
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="health-trainer-backup-${user.id}-${Date.now()}.json"`,
    });

    return backup;
  }

  @Post("restore")
  async restoreBackup(@CurrentUser() user: User, @Body() backup: UserDataBackup) {
    if (!backup?.data) {
      throw new BadRequestException("Payload backup non valido.");
    }
    const db = await this.db();
    try {
      return await restoreUserData(db, backup, user.id);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Ripristino backup non riuscito.",
      );
    }
  }

  @Delete("me")
  async deleteMyData(@CurrentUser() user: User) {
    const db = await this.db();
    return deleteUserData(db, user.id);
  }
}
