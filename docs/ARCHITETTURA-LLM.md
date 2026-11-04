# LLM Architecture

Reference document for the part of the project that answers a question:
**who decides the plan, and with what authority?**

Status: **proposal approved in the discussions of October 27, 2026, partially
implemented.** Phase A (dossier) and the HTTP provider of Phase C are done. On
October 30, 2026 an intermediate step landed outside this sequence: the LLM chooses
methodology, periodization and phases inside a code-computed envelope, with no Critic
([`METODOLOGIA-LLM.md`](METODOLOGIA-LLM.md)). §1 describes the code before that step;
the rest of this design (Proposer/Critic/Referee, provenance, eval) is not implemented.

---

## 0. Why this document exists

A general-purpose LLM can already write a training plan. What it cannot do is
**be on top of it**: it does not know the athlete's history, does not read
Garmin, does not remember that three weeks ago the volume overshot, does not
know that two sessions were skipped last week.

The value of the project is therefore not "an LLM that plans". It is:

1. **context** — an athlete dossier compiled from real data, not from a form;
2. **memory** — what was prescribed, what was done, what was reported;
3. **validation** — someone who challenges the proposal before it becomes an
   executed plan.

Without these three pieces, the LLM produces plausible and generic plans. With
these three pieces, it produces plans that no chatbot can produce.

---

## 1. Current state (honest)

| Piece | Status |
|---|---|
| Plan generation | sessions **deterministic**, `packages/domain/src/rules/plan-generator.ts`; since October 30, 2026 methodology, weekly structure, periodization and phases can come from the LLM (`methodology_decisions`) |
| Methodology envelope | computed by code, `rules/methodology.ts` (`buildMethodologyEnvelope`, `validateMethodology`) |
| Interview | `plan_interviews`, LLM-led, max 6 replies, findings feed the methodology |
| Validation | deterministic, `rules/validator.ts` (the generator validates its own output and throws if it violates) |
| Recent context | computed, `rules/recent-context.ts` (race/long effort, ACWR, gap) |
| Capacity and tier | computed, `rules/capacity.ts` and `rules/experience.ts` |
| LLM | **DeepSeek hardwired**: `DeepSeekProvider` (JSON mode, thinking, `retryable` errors). `LLM_MODEL=deepseek-v4-pro`, `LLM_MODEL_FAST=deepseek-flash`. Without a key, `DeterministicCoachProvider` remains |
| Plan memory | only saved documents: no summary used in later generations |
| `ai_runs` | coach only: saves metadata and failures (`success: false`), **not** the payload or the verdict. Interview and methodology calls are not logged |
| Coach (narration) | **DeepSeek active**: receives `recentContext`, cites the recent race, recovery window and ACWR |

Consequence: today the plan is correct with respect to constraints; the choice of
method is now made by the LLM, but session content and the envelope still live in
hand-written rules. The document
[`MODELLO-ATLETA.md`](MODELLO-ATLETA.md) describes the three levels already
implemented (history, measured capacity, recent context).

---

## 2. The problem we are solving

Four defects that a single "goal + age + weight" call cannot avoid:

| Defect | Real example |
|---|---|
| **Context starvation** | the model does not know that a marathon took place two days ago and proposes a loading week |
| **Lack of memory** | by week 5 it has forgotten the method chosen in week 1 and starts over from scratch |
| **No individual response** | it does not know that the prescribed threshold produces RPE 9 instead of 7, and keeps prescribing it |
| **No consistency between prescribed and done** | it does not know that half the sessions are skipped, so the real volume is half of the planned one |

These four points are **data**, not prompts. That is why the first thing to
build is not an agent: it is the dossier.

---

## 3. Decisions

### D1 — No autonomous agent. Fixed pipeline with reasoning roles

An agent that decides which tools to call moves non-determinism into the
**data collection** phase, which is exactly the phase that must be reliable.

- Collection, calculation and compilation of the dossier: **deterministic code**.
- Reasoning about method, envelope and sessions: **LLM**.
- Consistency check: **code**.

Autonomy lies in reasoning, not in retrieval. The same input always produces
the same dossier; only the plan is non-deterministic, and it is the only thing
we want flexible.

### D2 — The envelope is an **output**, not an input

The previous formulation ("the engine calculates the constraints, the LLM
chooses within the constraints") was **rejected**. The reason is concrete: the
duration of post-marathon unloading, restarting the gym, the taper, intensity
distribution are contested knowledge and depend on the athlete. Encoding them
in constants means freezing an opinion and hiding it in the code.

New formulation:

```
Proposer  → declares method + envelope + plan + rationale
Critic    → attacks method and envelope (too short? inconsistent with the plan?)
Referee   → verifies that the plan respects the declared envelope (arithmetic)
```

The envelope becomes a versioned artifact, with rationale and discarded
alternatives. The Critic can challenge it. The Referee knows nothing about
training: it compares two documents.

### D3 — The Referee remains code, and contains only what is not knowledge

| What it verifies | Why it is code |
|---|---|
| sessions ≤ available days | arithmetic |
| minutes ≤ declared time window | arithmetic |
| coherent dates, no session in the past | arithmetic |
| plan consistent with the declared envelope (days, maximum RPE per modality) | comparison between two documents |
| no overlap of sessions | arithmetic |

It **does not** contain: recovery durations, progression percentages, intensity
distribution, choice of method. That is the domain of the Proposer and the
Critic.

Rationale: two models of the same type share blind spots, so "two agents
agreeing" is not proof. An arithmetic check costs zero and never gets counting
wrong.

### D4 — The rule-based generator survives as a safety net

It is not deleted. It reverts to **fallback** when Proposer and Critic do not
converge within the maximum number of revisions. Its role stops being
"the brain" and becomes "the conservative default".

### D5 — Memory is derived facts, not chat history

What is saved and reused: what was prescribed, what was completed, reported RPE
and pain, adherence, capacity changes. The previous conversation is not passed
to the model: a compact and stable summary is passed.

---

## 4. Roles

| Role | Input | Output | Authority |
|---|---|---|---|
| **Proposer** | athlete dossier + method library | chosen method, envelope per modality, macro-plan, micro-plan, rationale, discarded alternatives | proposes |
| **Critic** | dossier + proposal + explicit rubric | structured verdict: approved / violations with evidence and requested correction | rejects, does not rewrite |
| **Referee** | plan + declared envelope | arithmetic and availability inconsistencies | blocks |
| **Reviewer** (next phase) | executed week, check-in, previous review | confirmation or modification of the method for the following week | proposes |
| **Daily Adjuster** (next phase) | state of the day, planned session | adaptation of the day | proposes, within the envelope |

No role writes directly to the published plan. Writing occurs only
after a green Referee, and structural changes require user confirmation.

---

## 5. Envelope

### 5.1 Form

Per **modality**, not per whole sport. Example of Proposer output:

```json
{
  "trainingModel": {
    "name": "polarizzato",
    "why": "8 settimane, base aerobica presente, 3 giorni disponibili",
    "alternatives": ["piramidale", "soglia 2x/settimana"]
  },
  "envelope": {
    "runningImpact": {
      "chosenDays": 12,
      "minDays": 5,
      "maxDays": 21,
      "basis": "6 maratone corse, 8 anni, 60 km/settimana pre-gara",
      "intensityAllowed": false
    },
    "strengthUpper": { "chosenDays": 2, "minDays": 1, "maxDays": 3, "basis": "nessun vincolo specifico" },
    "strengthLowerHeavy": { "chosenDays": 10, "minDays": 7, "maxDays": 21, "basis": "eccentriche pesanti post-maratona" },
    "mobility": { "chosenDays": 0, "basis": "nessuna controindicazione" }
  },
  "revision": 1,
  "review": { "verdict": "approved", "criticModel": "..." }
}
```

### 5.2 What was declared wrong

The current implementation uses a global constant in
`packages/domain/src/rules/recent-context.ts`:

```ts
{ applies: (a) => a.sport === "running" && (a.distanceM >= 40_000), days: 21 }
```

and `sessionPolicy()` applies the same policy to **all** sports, so within the
window even the gym is limited to RPE 6 and 40 minutes.

Two recognized errors:

1. **21 days for everyone.** The literature proposes windows, not constants: the
   duration depends on experience, number of races, race execution, pre-race
   volume, age, sleep. For an advanced amateur it is too conservative.
2. **Deload = no training.** False. Upper body work is useful and
   allowed; it is repeated impact and heavy eccentrics that are
   contraindicated in the first days. Deload is **per modality**, not global.

### 5.3 How duration is decided

| Signal | Effect |
|---|---|
| history (races run, years, pre-race volume) | shifts the `min/tipico/max` range |
| race execution (pace, splits, cramps) | shifts the choice within the range |
| check-in: pain, soreness, sleep, RPE at the same pace | can **lengthen** the window |
| check-in: no symptoms, RPE in line | can **shorten** it, before expiry |

The window is not a calendar date: it is a condition, with a date as
a reminder.

---

## 6. Athlete dossier

Minimum content for the model to be "up to speed". Token counts are indicative.

| Block | Content | Tokens |
|---|---|---|
| `identity` | age, sex, height, weight, time zone, units, tone | 100 |
| `history` | per sport: level reached, regular years, months of stop | 200–400 |
| `capacity` | active weeks, sessions/week, longest outing, estimated 5k, source and date | 150 |
| `recent_context` | last race/long effort, days elapsed, 7/28-day load, ACWR, gap | 200–300 |
| `individual_response` | prescribed vs reported RPE (4 weeks), actual adherence, recurring pain | 200–300 |
| `constraints` | real days and windows, equipment, injuries, **pathologies and medications**, red flag, PAR-Q | 150–250 |
| `method_memory` | current method, macrocycle phase, what worked and what did not | 300–500 |
| `plan_history` | last 4–6 weeks: synthetic prescribed vs completed | 400–700 |
| `trend` | 7/28-day aggregates (sleep, RHR, HRV, weight, nutrition) | 300–500 |
| `methodology` | extract from the method library relevant to sport/goal/phase | 500–1.000 |
| `output_contract` | JSON schema + style rules | 300–600 |

Indicative total: **3.000–5.000 tokens** for one week, **8.000–14.000** for
a macrocycle. The dossier is compiled by code, versioned and inspectable: if
the plan is wrong, one can understand whether the defect was in the data or in
the reasoning.

---

## 7. Loop

```
[S1] Dossier          deterministico
[S2] Proposer         LLM → proposta + envelope + metodo
[S3] Critic           LLM → verdetto sulla proposta
[S4] Referee          codice → coerenza aritmetica e rispetto dell'envelope
     ├─ verde         → [S5]
     ├─ violazioni    → torna a S2 con le violazioni esplicite (max 2 giri)
     └─ ancora rosso  → fallback al generatore a regole, marcato come tale
[S5] Persist          piano + metodo + envelope + verdetto, con provenance
[S6] Diff             confronto col piano precedente, conferma utente se strutturale
[S7] Explain          spiegazione all'atleta (può essere un ruolo separato, tono diverso)
```
Non-negotiable rules:

- Never publish a plan without a green Referee.
- Maximum 2 revisions, then fallback: no open loop.
- Each round is logged with proposal, verdict, and violations.
- The fallback is **declared** in the plan (`generatedBy: "rules_fallback"`), not
  passed off as model output.

---

## 8. Memory

| What | Where | Used for |
|---|---|---|
| prescribed plan (macro/micro) | `athlete_macro_plans`, `athlete_micro_plans` | method continuity, diff |
| executed | `activities`, session state | actual adherence |
| self-reported | `checkins` (RPE, pain, sleep, motivation) | individual response |
| weekly review | `weekly_reviews` | `continue/progress/deload` decision |
| method and envelope | in the plan (`trainingModel`, `envelope`) | consistency across weeks |
| LLM runs | `ai_runs` (to be extended with the payload) | audit and debug |

The synthesis is computed, not accumulated: each generation recompiles the dossier
from the current state. This is how week 5 does not "forget" week 1.

---

## 9. Schema changes required

| Schema | Addition | Reason |
|---|---|---|
| `MacroPlan` | `trainingModel: { name, why, alternatives[] }` | declare the method, not just the phases |
| `MacroPlan` | `envelope` per modality | make the envelope verifiable and discussable |
| `MacroPlan` | `review: { verdict, attempts, criticModel }` | know whether it was challenged |
| `MacroPlan` | `generatedBy: "llm"` or `"rules_fallback"` | not pass off the fallback as the model |
| `AiRunRecord` | `payload` (proposal/verdict) or reference | today it saves only metadata |
| `MicroPlan` | `withinEnvelope: boolean` + violations | track vetoes |

---

## 10. Evaluation

Not "the plan is good". You evaluate the **Critic** with deliberately wrong
cases, and the **Proposer** with known scenarios.

| Scenario | What must happen |
|---|---|
| marathon 2 days ago, experienced athlete | reduced-impact running, upper-body gym allowed, heavy squat no |
| marathon 2 days ago, beginner | longer window, no intensity |
| return after 2 years, former competitor | no intensity for 2 weeks, reduced volume until the 4th |
| 3 days available, plan with 5 sessions | Referee blocks |
| declared method "polarized", plan with 3 threshold sessions | Critic rejects for inconsistency |
| painful knee, plan with repeated impact | Critic rejects |
| volume increase > 30% in one week | Critic requests justification or corrects |
| zero activities imported | the flow does not invent numbers: it asks or uses calibration |

Metrics: correct vetoes / missed vetoes (false negatives are the serious risk),
average number of revisions, cost per plan, time per plan.

---

## 11. Steps to proceed

### Phase A — Dossier (no API key) — **done on October 27, 2026**

1. ~~`buildAthleteDossier()`~~ in `packages/domain/src/rules/athlete-dossier.ts`.
2. ~~Tests~~ on adherence, RPE deviation, recurring pain, plan memory,
   determinism, and field coverage.
3. ~~`GET /api/athlete/dossier`~~, with `404` when the baseline is missing and
   explicit `warnings` for non-measurable blocks.
4. A single path: `AthleteService.getContext()` feeds the plan and coach.
   `planMemory.method` is still `null`: it depends on `trainingModel` (Phase B).

**Why first:** it is the differentiator, it does not require a provider, and it is
verifiable. It also improves the rules-based plan, which remains in use.

### Intermediate step — LLM methodology — **done on October 30, 2026**

Not part of the original sequence. `MethodologyService` asks the LLM for a
`MethodologyDecision` and validates it against `buildMethodologyEnvelope()`;
`InterviewService` collects missing context first. How it relates to this design:

- it is a **proposer without a critic**: one correction retry if the proposal leaves
  the envelope, no adversarial review;
- the **envelope is computed by code**, the opposite of D2 and §5: transitional, to be
  replaced by the Proposer's envelope challenged by the Critic;
- it fills `planMemory.method` indirectly (`macroPlan.methodology`), but without
  `generatedBy`/provenance (Phase B) and without `ai_runs` logging;
- the week skeleton it produces (`qualitySessions`, `longSessionMin`) is
  running-shaped: Phase B should define the training model per sport.

### Phase B — Schema and provenance

1. Extend `MacroPlan` with `trainingModel`, `envelope`, `review`,
   `generatedBy` (§9).
2. Compatible migration: existing plans remain valid with optional fields;
   `recoveryWindow` remains until the envelope replaces it.
3. Extend `ai_runs` with the proposal and verdict payload.

### Phase C — Provider and loop

1. ~~Real HTTP `LlmProvider`~~ **done on October 27, 2026**: native
   `DeepSeekProvider` (OpenAI format, JSON mode, selectable thinking, timeout,
   `retryable` errors). The other providers remain without a client and fall back
   to the deterministic one.
2. `PlanProposer` and `PlanCritic` as interfaces; LLM implementation;
   `RulePlanProposer` as fallback.
3. Referee in code (§3, D3) + loop with max 2 revisions.
4. Complete logs, `generatedBy` populated, no auto-publish.

### Phase D — Adversarial evaluation

1. Script `npm run eval:plans` with the scenarios from §10.
2. Assertions on the Critic: it must reject wrong plans.
3. Report: false negatives before any other metric.

### Phase E — Real comparison and memory

1. UI: LLM plan and rules-based plan side by side for 2-3 weeks, with user
   choice.
2. If the gap is not evident, the idea does not pay off: keep the rules-based
   generator and invest elsewhere.
3. Only after: `Reviewer` and `Daily Adjuster` that use memory to correct
   the method, not just the load.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Correlated errors between Proposer and Critic | different providers or at least different models; adversarial prompt; set from §10 |
| No ground truth | adversarial evaluation + human review of the first plans + comparison with the rules-based plan |
| Non-determinism | save proposal and verdict; every plan reconstructible |
| Cost | 2-3 calls per generation; acceptable for personal use, to be measured for testing with other users |
| Prompt drift | versioned prompts + eval before every change |
| Envelope too permissive | the Critic has the explicit task of attacking it, not approving it |
| Referee perceived as "the old rules" | the Referee contains no knowledge: if it grows beyond arithmetic, it is a design error |

---

## 13. Open decisions

| Decision | Status | Default |
|---|---|---|
| Provider and model for Proposer and Critic | **partially decided**: DeepSeek, `deepseek-v4-pro` for the proposal and `deepseek-flash` for the coach. Whether the Critic should use a different model/provider is still open | two different providers, to decorrelate errors |
| Initial breadth of the methods library | open | 3-4 methods that the user knows |
| When the LLM becomes default and the rules fallback | open | after Phase E, with evidence |
| Persistence of the payload in `ai_runs` vs dedicated collection | open | `payload` field with size limit |
| Who signs off the human review of the first plans | open | the user, personal use |

---

## 14. What not to do

- Do not let the LLM calculate numbers derived from the data (load, readiness,
  adherence): those are calculated and verified.
- Do not use the chat history as memory: the dossier is used.
- Do not publish a plan without a verdict.
- Do not open review loops without a limit.
- Do not reintroduce training constants into the Referee (e.g. "21 days"): that
  is the Proposer's domain, contestable by the Critic.
- Do not pass off the fallback to rules as model output.
