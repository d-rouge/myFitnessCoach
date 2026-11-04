# Athlete model (v2)

Reference document for the domain part that answers a single question:
**how much load can I prescribe to this person, right now?**

The previous version used a single field `profile.experience`
(`beginner | intermediate | advanced`). It was ambiguous and, when it was made
heavy, dangerous: "former competitive athlete inactive for two years" and "advanced" are not
the same thing.

## General sports background

`profile.athleteBackground` describes the person's sports past **in
general**, not their experience in running or in the goal sport:
`occasional | consistent | amateur_competitive | elite | null`.

Onboarding collects it with a single choice: occasional athlete, athlete
consistent for many years, former competitive athlete, or former high-level athlete.
It serves as context to describe the person (e.g. "former top athlete"), not
as a measure of current fitness, and it does not authorize a greater load. Current practice comes from `profile.capacity` and from Garmin activities when available.

## Data and derivations for prescription

### 1. `profile.history` — sport-specific history

```ts
history: {
  sports: [
    { sport: "running", level: "competitive", yearsRegular: 12, detrainingMonths: 24 },
  ];
}
```

- `level`: `none | amateur | competitive | elite`.
- `yearsRegular`: **cumulative** years of regular practice, not age.
- `detrainingMonths`: months since the last regular block in **that** sport.

It is a sport-specific datum kept for compatibility with existing profiles and
with tier rules. The new onboarding does not ask for it: general sports background
is collected in `athleteBackground` and is not artificially transformed into
experience in the goal discipline.

### 2. `profile.capacity` — what you can do now

```ts
capacity: {
  lastActivityDate: "2026-10-25",
  activeWeeks: 8,           // settimane consecutive di allenamento attuale
  weeklySessions: 3,        // sedute/settimana fatte davvero nelle ultime 4
  longestRecentSessionMin: 40,
  recent5kSec: null,
  recent5kSource: "measured" | "declared",  // assente nei documenti vecchi = measured
  source: "garmin" | "manual" | "calibration",
  asOf: "2026-10-27T10:00:00.000Z",
}
```

This is the **measurable** part, and it takes precedence over everything. `lastActivityDate`
records the local date of the last session: Garmin calculates it from activities,
while in the manual path it is collected with simple time ranges. If there are no
imported activities, the dossier uses this date to detect any
period of inactivity; when imported data is present, the latter prevails.
In the wizard, the summary of the last 90 days filters records with Garmin source,
includes all disciplines and shows counts and duration per sport, as well as the
individual activities included. Hours are the sum of `durationSec` received from Garmin,
not a calculation of moving time alone.

| `source` | How it is obtained | Effect |
|---|---|---|
| `garmin` | `estimateCapacityFromActivities()` on imported activities. Recalculated by the server on save, on read (`GET /baseline`) **and** at every plan generation. The client sends only the intention, never the numbers. | Measured initial load. |
| `manual` | The athlete types them in. | Declared initial load. |
| `calibration` | There is nothing to measure. | Week 1 is a test at RPE 4-5; capacity is re-estimated as soon as data exist. |

With `garmin` and no imported activities, the baseline is **rejected**
(`400`), instead of saving silent zeros.

The 5K time has an explicit provenance. `recent5kSource: "declared"` means
that the athlete entered it (for example the race prediction that Garmin Connect
shows in their profile): it is data that the server cannot reconstruct from
activities, so `preserveDeclaredFiveK()` preserves it when capacity is
recalculated on save, on read and at plan generation. A `measured` value
(or absent) is instead derived with Riegel from the reference run and
is updated at every sync.

The same rule applies to `calibration`: as long as there is no data, the document
keeps placeholder zeros; as soon as activities arrive, reading shows the
measured capacity. A single source of truth: `withMeasuredCapacity()`
(`apps/api/src/baseline/measured-capacity.ts`), used by reading and by
plan generation.

Baselines saved before v2 (`experience` field) are normalized on
read with `source: "calibration"`: the old numbers are not considered
reliable, so the first generation re-estimates them from activities and, if there
are none, uses the test week.

### 2b. Availability, goal and preferences

Availability no longer asks for minutes or specific days: the athlete indicates
**how many days per week** they can train and whether they have room for a **longer
session** (weekend or a chosen day). `resolveAvailabilityDays()`
translates these two controls into the concrete days used by the generator, with
60 minutes for normal sessions and 120 for the long one. Previous documents
remain valid: if `daysPerWeek` is missing, it is derived from `days`.

The **goal type** is no longer a question: `inferGoalType()` infers it
from the description (race, performance, body composition, strength, habit,
health) and the server realigns the field at every save. The description remains
the text that reaches the planning model.
The preferences no longer ask for the time: the athlete trains when they want and
that information does not change the prescription. The coach's tone and the
other preferences remain; the sixth step of the profile is the **summary**.

### 3. `profile.experienceTier` — derived, never asked

```ts
experienceTier: "novice" | "returning" | "trained" | "highly_trained";
```

Calculated by `deriveExperienceTier()` for the sport of the primary goal
using the sport-specific `profile.history` and `profile.capacity`. General
background does not modify the tier. It is recalculated on every read and on
every save; a value sent by the client is overwritten.

| Tier | Condition | Consequence |
|---|---|---|
| `novice` | history < 2 years **and** `activeWeeks < 12` | no structured work, reduced volume |
| `returning` | history ≥ 2 years or competitive background, **and** `detrainingMonths ≥ 12` | technical sessions ok, intensity from week 3, reduced volume until week 4 |
| `trained` | history ≥ 2 years **or** `activeWeeks ≥ 12` | standard progression |
| `highly_trained` | competitive background, no break, `activeWeeks ≥ 24`, ≥ 3 sessions/week, outing ≥ 60 min | reduced % progression, high ceiling |

The rule that holds it all together:

> **General background does not authorize the initial load. Current capacity
> is the reference for starting; sport-specific history remains a separate
> data point.**

The reason is physiological: motor memory and movement economy return in
weeks, tendons and bones in months. A former competitive athlete has the engine
ready and the tires dry.

## Recent context (fourth level, not persisted in the athlete)

`buildRecentContext(activities, { now })` produces structured facts about the
immediate past:

```ts
{
  lastLongEffort: { label: "maratona", localDate: "2026-10-25", daysAgo: 2, recoveryDays: 21 },
  postRaceRecovery: { active: true, weeks: 3, untilDate: "2026-11-15", reason: "..." },
  load7dMin: 240,
  load28dMin: 900,
  acuteChronicRatio: 1.07,
  flags: ["post_race_recovery", "long_effort_recent"],
}
```

The recovery window is saved in `macroPlan.recoveryWindow` and applied
deterministically: **no loading week** until it expires, whatever the tier.
Inside the window the long session is also downgraded: no "progressive long
run", but a shorter easy run at RPE 5. Thresholds are in `RECOVERY_RULES`: marathon 21 days, half 14,
long ≥ 15 km 7, gran fondo 100 km 10, effort ≥ 150 min 7; a race recognized
by the title brings the window to at least 14 days.

> **Recognized limitation (October 27, 2026).** These constants are a
> provisional default, not a truth. Two flaws: (1) 21 days apply to a
> beginner but are too conservative for an advanced amateur, because the real
> duration depends on experience, number of races, execution and pre-race
> volume; (2) the policy is global, so within the window even the gym drops to
> RPE 6, whereas upper body work is useful and allowed — repeated impact and
> heavy eccentrics are contraindicated. Deload is **per modality**, not for the
> entire athlete. The replacement is described in
> [`ARCHITETTURA-LLM.md`](ARCHITETTURA-LLM.md) §5.

## Boundary with the LLM

Context is **baseline data**, not judgment. But the boundary does not run where
it seemed to on October 26: deload duration and intensity distribution are not
"guardrails", they are **contestable knowledge**.

| Code (deterministic) | LLM (Proposer) | LLM (Critic) | Code (Referee) |
|---|---|---|---|
| calculation of capacity, ACWR, adherence, gap; dossier | method, per-modality envelope, plan, motivation | challenges envelope and coherence with the method | arithmetic: sessions ≤ days, minutes ≤ window, plan vs envelope |
| block for red flag / PAR-Q | recovery and taper priors | verifies that the priors are defensible for *this* athlete | no training knowledge |
| tier derivation | explains what `returning` means | verifies that the plan is coherent with the tier | — |

The turning point: **the envelope is an output of the Proposer**, not an input
to the code. The Critic attacks it; the Referee compares the plan with what the
Proposer declared. Thus there is no hand-written "21 days" that applies to
everyone. Full design in [`ARCHITETTURA-LLM.md`](ARCHITETTURA-LLM.md).

## Plan regeneration

Regenerating the macro-plan **replaces** the previous one
(`supersedeMacroPlans`): two plans with the same `startDate` would make
`getCurrentMacroPlan` non-deterministic, and a plan generated before a race
could survive the correct one. The versioned record is the baseline, not the
plan: plans are derived artifacts.

## What is not done yet

- The "calibration week → new estimate" feedback loop currently works only if
  Garmin activities arrive: reading check-ins (actual RPE, pain, completion) to
  update `capacity` without an import is still missing.
- The `returningPersona` persona exists as a demo, but there is still no e2e
  test that starts from real Garmin activities and verifies the post-race window
  end-to-end.
- The counters use the baseline time zone: if the athlete changes time zone
  during a trip, the baseline must be updated so the calculation remains
  coherent.
- The per-modality envelope does not exist yet: it is the global constant
  described above. It must be implemented as a Proposer output
  (`ARCHITETTURA-LLM.md`).
- `athleteBackground` is included in the dossier as context; it does not yet
  influence
the deterministic rules for progression or load.
