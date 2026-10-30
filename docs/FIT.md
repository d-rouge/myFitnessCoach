# FIT: reading, interpretation and brief for the LLM

**Purpose:** turn a binary `.FIT` file into structured data and a compact brief that an LLM can use without receiving thousands of raw records.

## Why an intermediate layer is needed

A `.FIT` is not text: it is a binary format with messages (`session`, `lap`, `record`, `length`, `set`, `event`, …). An LLM cannot read it reliably. The pipeline is therefore:

```
ZIP / .FIT
   ↓  fit-file-parser
structured FIT messages
   ↓  normalization + aggregation
ActivityAnalysis (summary, laps, splits, zone, derived)
   ↓  buildActivityBrief
compact brief (Markdown/JSON) + summary
   ↓
LLM context
```

The 1 Hz records (thousands) **are not sent** to the model: they are only used to calculate aggregates and anomalies.

## What we extract

| FIT block | Use |
|---|---|
| `sessions` | sport, duration, distance, HR, power, cadence, elevation gain/loss, calories, training effect/load |
| `laps` | distance-based splits (on Garmin running: 1 km), HR, power, pace, elevation gain/loss |
| `splits` | automatic run/walk splits; we filter out walk/stand and the entire activity |
| `records` | only for HR drift and zone fallback; not saved in the brief |
| `time_in_zone` | minutes in HR zone |
| `activity_metrics` | VO2max, recovery time, training effect |
| `lengths` | swimming lengths (future extension) |
| `sets` | gym sets (future extension) |

## Normalization

- `sessions` is an array; singular `session` is not reliable.
- Timestamps are `Date`; we convert them to ISO.
- Running cadence in FIT is in cycles/min: we convert it to **steps/min** (`×2`).
- For running we prefer **1 km laps** over automatic run/walk splits.
- We exclude splits with too small a distance, duration < 60 s, or equal to the entire activity.
- HR zones come from `time_in_zone` (`reference_mesg=session`); if absent, approximate fallback from records.

## What the brief contains

Synthetic example:

```md
## Activity
- Sport: running
- Date: 2026-10-25
- Duration: 45m 0s
- Distance: 10.00 km
- Average pace: 4:30/km
- HR: 165 / 182 bpm
- Cadence: 176 spm
- Elevation gain/loss: +40 / -35 m
- Calories: 720 kcal
- Training effect: 4.2 (anaerobic 0.8)

## Splits
| # | distance | time | pace | HR |
|---|---|---|---|---|
| 1 | 1.00 km | 4:38 | 4:38/km | 158 |
| 2 | 1.00 km | 4:32 | 4:32/km | 164 |
| ... | ... | ... | ... | ... |

## HR Zones
Z1: 1 min · Z2: 5 min · Z3: 12 min · Z4: 20 min · Z5: 7 min

## Observations
- Negative split: yes
- Pace variability: 2.1%
- HR drift: +3.4%
- Best split: 4:25/km
- Worst split: 4:41/km
- Elevation gain per km: 4.0 m/km
```

The brief is designed to be:
- **compact**: ~1–3 KB, not 17,000 records;
- **structured**: stable sections, easy to cite;
- **explainable**: the LLM can use the numbers without inventing them;
- **non-diagnostic**: it describes the workout, it does not make diagnoses.

## API and persistence

```text
POST /api/integrations/garmin/activities/:activityId/analyze
GET  /api/integrations/garmin/activities/:activityId/analysis
```

- `analyze` downloads the activity ZIP from Garmin, extracts the `.FIT`, parses it, saves `ActivityAnalysis` and returns the compact version (`summary`, `derived`, `hrZones`, `brief`, counts).
- Mongo collection: `activity_analyses` (unique `userId+source+externalId`).
- UI: **Analyze FIT** button on each Garmin activity; the brief is expandable.

## Real-world validation

On a real Garmin activity:

- FIT ~1.3 MB
- 17,492 records
- 44 laps
- 42 usable splits
- 25 `time_in_zone` messages
- final brief ~2 KB, without raw records
- HR drift, negative split, pace variability and best/worst split calculated

## Current limitations

- Swimming: parsing of `lengths` is not yet exposed in the brief.
- Gym: `sets` not yet normalized.
- GPS/elevation: used only for elevation gain/loss, not for route analysis.
- HR zones: depend on the device configuration.
- Splits: the lap vs split choice is heuristic per sport.
- It does not replace a biomechanical or clinical analysis.

## Next step

1. Add `lengths` for swimming and `sets` for the gym.
2. Inject the briefs of recent activities into the coach's context.
3. Only then, generate `.FIT` workouts for export to Garmin using the FIT SDK encoder.
