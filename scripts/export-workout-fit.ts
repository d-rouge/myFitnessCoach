import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { create5x800mWorkout, encodeWorkoutToFit } from "@health-trainer/integrations";

function main() {
  const workout = create5x800mWorkout();
  const fitBytes = encodeWorkoutToFit(workout);

  const outPath = resolve(process.cwd(), "dist", "workouts", "5x800m-intervals.fit");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(fitBytes));

  console.log(`\n========================================`);
  console.log(`Workout FIT generato con successo!`);
  console.log(`Path: ${outPath}`);
  console.log(`Dimensione: ${fitBytes.length} byte`);
  console.log(`Sport: ${workout.sport}`);
  console.log(`Nome: ${workout.name}`);
  console.log(`Numero step: ${workout.steps.length}`);
  console.log(`========================================`);
  console.log(`\nCome importarlo in Garmin Connect:`);
  console.log(`1. Apri https://connect.garmin.com/modern/workouts`);
  console.log(`2. Clicca su "Importa" (Training & Planning > Workouts > Import)`);
  console.log(`3. Seleziona il file ${outPath}`);
  console.log(
    `4. Oppure copia il file via USB nella cartella "NewFiles" del dispositivo Garmin.\n`,
  );
}

main();
