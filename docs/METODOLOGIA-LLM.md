# Methodology chosen by the LLM

## Principle

The choice of training methodology is a decision of the model, not of a deterministic table. The LLM knows the literature and the schools (polarized, pyramidal, threshold, run-walk, concurrent strength, etc.) and must be queried with an explicit criterion:

> Given this athlete, this goal, these constraints, and these last two
> weeks of training, what is the most effective methodology and why?
> Compare at least two alternatives, state the assumptions, the risks, and which
> data would change the answer.

The question must be repeated as the plan progresses: at the start, at the weekly review, and whenever a relevant datum changes (race, pain, adherence, load, goal). With more data, personalization becomes more evident, not more rigid.

The deterministic layer does not decide the methodology. It serves to:

- calculate the facts (volumes, loads, ACWR, recovery, session types);
- apply safety guardrails;
- verify the arithmetic and limits of the proposal;
- generate sessions once the methodology is approved.

## Data the LLM must receive

- profile, goal, target date, experience, current capacity;
- `trainingHistory` from the last two weeks: sessions, sport, type, duration, distance, pace, HR, training effect, load, title;
- summary: sessions by sport, easy/long/quality/race/strength, intense share, longest session, trend vs the previous two weeks;
- `recentContext`: 7/28-day load, ACWR, post-race recovery, flags;
- current plan and review, if regenerating;
- adherence, RPE, pain, readiness;
- constraints, equipment, availability, preferences.

## Expected output

```json
{
  "methodology": "polarized_80_20",
  "why": "…",
  "evidence": ["principio fisiologico", "riscontro nei dati"],
  "alternatives": [{ "name": "pyramidal", "whyNot": "…" }],
  "weeklyStructure": {
    "sessions": 4,
    "qualitySessions": 2,
    "longSessionMin": 75,
    "strengthSessions": 2,
    "plyometrics": false
  },
  "assumptions": ["…"],
  "risks": ["…"],
  "dataThatWouldChange": ["…"],
  "confidence": "medium"
}
```

Rules:

- no invented bibliographic citations: cite principles and names of methodologies, not fictitious papers;
- no numbers outside the envelope calculated by the domain;
- if a datum is missing, it must be declared, not filled in;
- safety (red flags, acute pain, post-race) is non-negotiable.

## Recurring flow

1. The domain builds the context and the safety envelope.
2. The LLM receives context + question + envelope and chooses the methodology.
3. The domain validates the proposal (arithmetic, ceilings, safety).
4. If valid, the generator produces the plan with that structure.
5. At the weekly review, with the new data, the same question is asked again: confirm, adapt, or change methodology.

## Why not a fixed table

A table can translate "50 km/week" into "polarized" but cannot distinguish an athlete who has been running 50 km for ten years from one who did it once three months ago, nor read the type of sessions, pain, adherence, or individual response. The LLM can do this, provided the facts are calculated and the limits are verified.

### Horizon and periodization

The plan horizon derives from the agreed target date (or from the baseline date). In the interview, the LLM can propose a more realistic date and, after the athlete confirms, the date is saved in the baseline: the plan and the goal sheet read the same horizon.

The LLM also chooses the periodization (`periodization`): model, load weeks before deload, deload weeks per cycle, and taper. The generator applies that structure to the weeks (`3:1`, `2:1`, blocks, etc.). The weekly structure of the methodology applies to the first block: the recovery window if active, otherwise the first mesocycle (load + deload). Afterwards, the week resumes the phase progression, while the load/deload rhythm of the periodization continues. If the methodology is post-race recovery, it applies only to that window.

## Interview and generation

The "Talk to the coach" button opens an interview, not an immediate generator.

1. `POST /api/plan/interview` creates the interview and performs the first turn. The model receives the dossier (including the last two weeks) and asks at most two targeted questions.
2. `POST /api/plan/interview/:id/message` adds the response, updates the `findings`, and continues. The interview closes when the model declares `readyToPlan` or after 6 responses.
3. `POST /api/plan/interview/:id/generate` re-evaluates the methodology **with the collected findings**, then generates the plan with that structure.

The generated plan preserves the methodology (`macroPlan.methodology`) and the week carries the `methodology_guided` flag. If the goal changes, the previous methodology is not reused: a new analysis/interview is needed.

A methodology chosen within the post-race window applies only to that window (`applyThroughWeek`): afterwards, the week resumes quality, long, and volume from the macrocycle phase. Otherwise a 3-week recovery would doom the entire plan to remain in recovery.

Current limitation: findings influence the structure (sessions, quality, long, strength, plyometrics) via the methodology, but the long day remains the one from baseline availability. Moving it based on the athlete's response is the next refinement.

## MVP
1. `trainingHistory` (done: last 2 weeks with type and trend).
2. Endpoint/service that queries the LLM with the context and saves the
   `MethodologyDecision`.
3. Interview with fixed questions to collect the missing data.
4. Generation of the plan from the chosen methodology, with validation.
5. Re-evaluation at the weekly review.
