import {
  deleteUserData,
  exportUserData,
  getCurrentMicroPlan,
  restoreUserData,
  type UserDataBackup,
} from "@health-trainer/db";
import {
  buildHevyRoutine,
  buildSampleFullBodyHevyRoutine,
  create5x800mWorkout,
  encodeSessionWorkoutFit,
  encodeWorkoutToFit,
  exportHevyRoutine,
} from "@health-trainer/integrations";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { MongoService } from "../database/mongo.service.js";

function resolveUserId(headerUserId?: string): string {
  return headerUserId?.trim() ? headerUserId.trim() : "user_marco";
}

@Controller("export")
export class ExportController {
  constructor(private readonly mongo: MongoService) {}

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
    @Param("sessionId") sessionId: string,
    @Headers("x-user-id") headerUserId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const userId = resolveUserId(headerUserId);
    const db = await this.db();
    const microPlan = await getCurrentMicroPlan(db, userId);

    if (!microPlan) {
      throw new NotFoundException("Nessun piano settimanale attivo trovato.");
    }

    const session = microPlan.sessions.find((s) => s.id === sessionId);
    if (!session) {
      throw new NotFoundException(`Sessione ${sessionId} non trovata nel piano attivo.`);
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
    @Body() body: { sessionId?: string; apiKey?: string },
    @Headers("x-user-id") headerUserId?: string,
  ) {
    const userId = resolveUserId(headerUserId);
    const db = await this.db();
    const microPlan = await getCurrentMicroPlan(db, userId);

    let session = microPlan?.sessions.find((s) => s.id === body.sessionId);
    if (!session && microPlan) {
      session = microPlan.sessions.find((s) => s.type === "strength");
    }

    if (!session) {
      session = {
        id: "strength_generic",
        date: new Date().toISOString().slice(0, 10),
        sport: "strength",
        type: "strength",
        title: "Scheda Forza e Stabilità",
        durationMin: 45,
        intensity: { mode: "rpe", rpe: 7 },
        blocks: [],
        equipment: [],
        location: "gym",
        alternatives: [],
        contraindications: [],
        status: "planned",
      };
    }

    const payload = buildHevyRoutine(session);
    return exportHevyRoutine(payload, body.apiKey);
  }

  @Get("backup")
  async downloadBackup(
    @Headers("x-user-id") headerUserId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = resolveUserId(headerUserId);
    const db = await this.db();
    const backup = await exportUserData(db, userId);

    res.set({
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="health-trainer-backup-${userId}-${Date.now()}.json"`,
    });

    return backup;
  }

  @Post("restore")
  async restoreBackup(@Body() backup: UserDataBackup) {
    if (!backup?.userId || !backup.data) {
      throw new BadRequestException("Payload backup non valido.");
    }
    const db = await this.db();
    return restoreUserData(db, backup);
  }

  @Delete("me")
  async deleteMyData(@Headers("x-user-id") headerUserId?: string) {
    const userId = resolveUserId(headerUserId);
    const db = await this.db();
    return deleteUserData(db, userId);
  }
}
