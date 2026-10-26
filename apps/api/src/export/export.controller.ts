import { create5x800mWorkout, encodeWorkoutToFit } from "@health-trainer/integrations";
import { Controller, Get, Header, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";

@Controller("export")
export class ExportController {
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
}
