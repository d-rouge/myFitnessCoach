import { Decoder, Stream } from "@garmin/fitsdk";
import type { PlannedSession } from "@health-trainer/domain";
import { describe, expect, it } from "vitest";
import {
  create5x800mWorkout,
  encodeSessionWorkoutFit,
  encodeWorkoutToFit,
  paceToSpeedMs,
  parsePaceStringToSecKm,
  parseTextTarget,
  sessionToWorkoutDef,
} from "./workout-encoder";

describe("workout-encoder", () => {
  it("converts pace string and sec/km to speed m/s correctly", () => {
    expect(parsePaceStringToSecKm("4:30")).toBe(270);
    expect(parsePaceStringToSecKm("5:00")).toBe(300);

    const speed = paceToSpeedMs(270);
    // 1000m / 270s ≈ 3.7037 m/s
    expect(speed).toBeCloseTo(3.7037, 3);
  });

  it("throws on invalid pace values", () => {
    expect(() => parsePaceStringToSecKm("invalid")).toThrow();
    expect(() => parsePaceStringToSecKm("4:65")).toThrow();
    expect(() => paceToSpeedMs(0)).toThrow();
  });

  it("encodes a 5x800m running workout into a valid .FIT binary stream", () => {
    const workout = create5x800mWorkout({
      warmupMinutes: 10,
      cooldownMinutes: 10,
      fastPaceSecKm: 255, // 4:15/km
      slowPaceSecKm: 275, // 4:35/km
    });

    const fitBytes = encodeWorkoutToFit(workout);

    expect(fitBytes).toBeInstanceOf(Uint8Array);
    expect(fitBytes.length).toBeGreaterThan(150);

    // Verify .FIT magic header at bytes 8-11
    const magicHeader = String.fromCharCode(...fitBytes.slice(8, 12));
    expect(magicHeader).toBe(".FIT");

    // Decode with official FIT SDK Decoder to verify structure
    const stream = Stream.fromByteArray(fitBytes);
    const decoder = new Decoder(stream);
    const { messages, errors } = decoder.read();

    expect(errors).toEqual([]);
    expect(messages.fileIdMesgs).toHaveLength(1);
    expect(messages.fileIdMesgs?.[0]?.type).toBe("workout");
    expect(messages.fileIdMesgs?.[0]?.manufacturer).toBe("garmin");

    expect(messages.workoutMesgs).toHaveLength(1);
    expect(messages.workoutMesgs?.[0]?.sport).toBe("running");
    expect(messages.workoutMesgs?.[0]?.numValidSteps).toBe(5);
    expect(messages.workoutMesgs?.[0]?.wktName).toBe("5x800m Ripetute");

    const steps = messages.workoutStepMesgs ?? [];
    expect(steps).toHaveLength(5);

    // Step 0: Warmup 10 min
    expect(steps[0]?.wktStepName).toBe("Riscaldamento");
    expect(steps[0]?.durationType).toBe("time");
    expect(steps[0]?.durationTime).toBe(600); // 10 min
    expect(steps[0]?.intensity).toBe("warmup");
    expect(steps[0]?.targetHrZone).toBe(2);

    // Step 1: 800m run
    expect(steps[1]?.wktStepName).toBe("800m Ripetuta");
    expect(steps[1]?.durationType).toBe("distance");
    expect(steps[1]?.durationDistance).toBe(800);
    expect(steps[1]?.intensity).toBe("interval");
    expect(steps[1]?.targetType).toBe("speed");
    expect(steps[1]?.customTargetSpeedLow).toBeCloseTo(3.636, 2);
    expect(steps[1]?.customTargetSpeedHigh).toBeCloseTo(3.921, 2);

    // Step 2: 200m recovery
    expect(steps[2]?.wktStepName).toBe("200m Recupero");
    expect(steps[2]?.durationType).toBe("distance");
    expect(steps[2]?.durationDistance).toBe(200);
    expect(steps[2]?.intensity).toBe("recovery");

    // Step 3: Repeat 5x back to step 1
    expect(steps[3]?.wktStepName).toBe("Ripeti 5x");
    expect(steps[3]?.durationType).toBe("repeatUntilStepsCmplt");
    expect(steps[3]?.durationStep).toBe(5);
    expect(steps[3]?.repeatSteps).toBe(1);

    // Step 4: Cooldown 10 min
    expect(steps[4]?.wktStepName).toBe("Defaticamento");
    expect(steps[4]?.durationType).toBe("time");
    expect(steps[4]?.durationTime).toBe(600);
    expect(steps[4]?.intensity).toBe("cooldown");
    expect(steps[4]?.targetHrZone).toBe(1);
  });

  it("rejects FIT export for strength and mobility sessions", () => {
    const strength: PlannedSession = {
      id: "strength_1",
      date: "2026-10-27",
      sport: "strength",
      type: "full_body_strength",
      title: "Palestra",
      durationMin: 45,
      intensity: { mode: "rpe", rpe: 7 },
      blocks: [],
      equipment: [],
      location: "gym",
      alternatives: [],
      contraindications: [],
      status: "planned",
    };

    expect(() => sessionToWorkoutDef(strength)).toThrow(/non supportato/i);
    expect(() => encodeSessionWorkoutFit(strength)).toThrow(/non supportato/i);
  });

  it("parses textual pace and heart-rate targets", () => {
    const pace = parseTextTarget("Passo 4:20-4:35/km (Z4)");
    expect(pace.target.type).toBe("speed");
    if (pace.target.type === "speed") {
      expect(pace.target.minSpeedMs).toBeCloseTo(paceToSpeedMs(275), 4);
      expect(pace.target.maxSpeedMs).toBeCloseTo(paceToSpeedMs(260), 4);
    }

    const zone = parseTextTarget("Zona 2 aerobica costante");
    expect(zone.target).toEqual({ type: "heartRateZone", zone: 2 });

    const cadence = parseTextTarget("Cadenza 85-95 rpm");
    expect(cadence.target).toEqual({ type: "cadence", minRpm: 85, maxRpm: 95 });
  });

  it("maps a running pace target into the encoded FIT step", () => {
    const session: PlannedSession = {
      id: "sess_pace",
      date: "2026-10-27",
      sport: "running",
      type: "intervals",
      title: "Ripetute",
      durationMin: 40,
      intensity: { mode: "rpe", rpe: 8 },
      blocks: [
        {
          repeat: 1,
          steps: [{ kind: "work", distanceM: 1000, target: "Passo 4:20-4:35/km" }],
        },
      ],
      equipment: [],
      location: "outdoor",
      alternatives: [],
      contraindications: [],
      status: "planned",
    };

    const { messages, errors } = new Decoder(
      Stream.fromByteArray(encodeSessionWorkoutFit(session)),
    ).read();

    expect(errors).toEqual([]);
    const step = messages.workoutStepMesgs?.[0];
    expect(step?.targetType).toBe("speed");
    expect(step?.customTargetSpeedLow).toBeCloseTo(paceToSpeedMs(275), 2);
    expect(step?.customTargetSpeedHigh).toBeCloseTo(paceToSpeedMs(260), 2);
  });

  it("rejects invalid workout definitions", () => {
    expect(() =>
      encodeWorkoutToFit({
        name: "",
        sport: "running",
        steps: [],
      }),
    ).toThrow("Workout name cannot be empty");

    expect(() =>
      encodeWorkoutToFit({
        name: "Test",
        sport: "running",
        steps: [],
      }),
    ).toThrow("Workout must contain at least one step");
  });

  it("encodes any planned session into a valid .FIT workout binary", () => {
    const session: PlannedSession = {
      id: "sess_interval_1",
      date: "2026-10-27",
      sport: "running",
      type: "intervals",
      title: "5x800m Ripetute Corsa",
      durationMin: 50,
      intensity: { mode: "rpe", rpe: 8 },
      blocks: [
        {
          repeat: 1,
          steps: [{ kind: "warmup", durationMin: 10, target: "Riscaldamento" }],
        },
        {
          repeat: 5,
          steps: [
            { kind: "work", distanceM: 800, target: "Ripetuta 800m" },
            { kind: "recovery", distanceM: 200, target: "Recupero 200m" },
          ],
        },
        {
          repeat: 1,
          steps: [{ kind: "cooldown", durationMin: 10, target: "Defaticamento" }],
        },
      ],
      equipment: [],
      location: "outdoor",
      alternatives: [],
      contraindications: [],
      status: "planned",
    };

    const fitBytes = encodeSessionWorkoutFit(session);
    expect(fitBytes).toBeInstanceOf(Uint8Array);
    expect(fitBytes.length).toBeGreaterThan(150);

    const stream = Stream.fromByteArray(fitBytes);
    const decoder = new Decoder(stream);
    const { messages, errors } = decoder.read();

    expect(errors).toEqual([]);
    expect(messages.workoutMesgs).toHaveLength(1);
    expect(messages.workoutMesgs?.[0]?.wktName).toContain("5x800m");
  });
});
