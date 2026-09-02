# Feature Specification: Testo — Automated Grading

**Feature Branch**: `002-automated-grading`
**Created**: 2026-08-28
**Status**: Draft
**Depends on**: `001-foundation` (consumes the `Exam`, `Question`, `Exam Attempt`, and `Answer` entities; is triggered when an attempt reaches `submitted` or `auto_submitted`)
**Input**: Conversational elicitation — deterministic MCQ grading and fully-automatic, semantic-similarity-based essay grading, with no routine human review.

This spec covers **how a submitted attempt's answers become a score** — both MCQ and essay — and the integrity guarantees that make fully-automatic grading defensible. It does not cover how a student takes an exam (`001-foundation`), how results are emailed (`003-notifications`), or how an Admin browses results (`004-admin-insights`), though it defines the override mechanism those specs rely on.

---

## Constitution Alignment

| Principle | How this spec satisfies it |
|---|---|
| **I — Server Is the Sole Source of Truth** | All grading computation (MCQ comparison and essay similarity scoring) runs server-side only; no score is ever accepted from or computed by the client (FR-001, FR-006, FR-007). |
| **II — Zero Exposure of Grading Criteria** | Correct choices and reference answers are never returned in any grading-related response visible to a Student (FR-015). |
| **VII — Simplicity Before Sophistication** | MCQ grading has no partial credit or negative marking (FR-002); essay grading is a single holistic score per question in Phase 1, not sub-criteria (FR-006). |
| **X — Automated Grading Integrity, Auditability, and Adversarial Resistance** | This principle is this spec's primary basis: determinism (FR-008), multiple reference answers (FR-009), calibration before real use (FR-010), robustness to degenerate input (FR-011–FR-013), audit-only advisory flags (FR-014, FR-016), full audit trail (FR-017), no silent failure (FR-018), and post-hoc override (FR-019) are all direct implementations of Principle X's guarantees. |

---

## Clarifications

### Session 2026-08-28 *(carried over from the project-level discussion that produced this spec)*
- **Q: Human review before finalizing an essay grade?** → A: None, routinely. Fully automatic; Admin can override after the fact.
- **Q: Essay grading in Phase 1?** → A: Yes, required from the first release.
- **Q: What happens to an answer that raises an internal uncertainty flag (e.g. possible negation mismatch, possible keyword stuffing)?** → A: It is still graded automatically like any other answer. The flag is recorded for later reference only — it never delays or blocks finalization.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — MCQ Answers Are Graded Deterministically (Priority: P1)

A Student's selected choice for an MCQ question is compared to the correct choice and scored, with no ambiguity and no partial outcomes.

**Independent Test**: Submit a set of MCQ answers with known correct/incorrect choices and confirm each scores exactly as expected, with no partial credit and no penalty for a wrong answer.

**Acceptance Scenarios**:
1. **Given** a Student selected the correct choice, **When** graded, **Then** the question scores full marks.
2. **Given** a Student selected an incorrect choice, **When** graded, **Then** the question scores zero — never a negative value.
3. **Given** a Student left an MCQ unanswered, **When** graded, **Then** it is scored the same as an incorrect answer (zero), never blocking the rest of the attempt from being graded.

---

### User Story 2 — Essay Answers Are Graded Automatically (Priority: P1)

A Student's free-text answer is scored by comparing it to one or more reference answers, without a human reading it first.

**Independent Test**: Submit essay answers with known expected correctness (clearly right, clearly wrong, and a differently-worded-but-correct case) and confirm each receives a reasonable score with no manual step.

**Acceptance Scenarios**:
1. **Given** an essay question with one or more reference answers, **When** a Student's answer is graded, **Then** a score is produced without requiring an Admin to read or approve it first.
2. **Given** a Student's answer is correct but worded very differently from any single reference answer, **When** graded, **Then** the grading MUST compare against all defined reference answers and use the best match, rather than penalizing valid alternate phrasing.
3. **Given** an essay answer whose grading raises an internal uncertainty flag, **When** the attempt is graded, **Then** the Student still receives a finalized automatic grade — no pending/awaiting-review state is shown (per Clarifications).
4. **Given** a Student submits an empty, extremely short ("yes"), excessively long, or suspiciously repetitive essay answer, **When** it is graded, **Then** the system produces a valid normalized score without crashing, erroring, or leaving the question — or the rest of the attempt — ungraded.

---

### User Story 3 — Grading Decisions Remain Explainable and Correctable (Priority: P1)

Every automated grading decision leaves enough of a record that it can be explained after the fact, and the underlying data supports an Admin correcting it later — even though no one reviewed it before it was finalized.

**Independent Test**: Grade a batch of answers, then confirm every field required by FR-017 can be reconstructed/explained purely from stored records, without re-running anything.

**Acceptance Scenarios**:
1. **Given** any graded essay answer, **When** its record is inspected, **Then** it shows the exact text graded, which reference answer matched best, the raw score, any advisory flags, and a timestamp.
2. **Given** a grading pass fails or times out, **When** this happens, **Then** the system retries automatically (bounded) and never leaves the attempt silently and permanently ungraded.
3. **Given** a finalized grade, **When** it needs correcting, **Then** the underlying data model supports an override being recorded against it, including who and why (the Admin-facing action itself is specified in `004-admin-insights`).
4. **Given** an essay answer originally auto-graded 0.60 that an Admin overrides to 0.85, **When** the override is applied, **Then**: the attempt's total score recalculates using 0.85 (FR-019b/FR-020); the original 0.60 record remains intact and retrievable (FR-019a); the Student's result view shows the new score along with an indicator that it was manually reviewed (FR-019c); and if the result notification was already sent, a follow-up notification is triggered (`003-notifications` FR-004a).

---

## Edge Cases

- Grading service fails/times out for one essay answer → retried per FR-018; a persistently failing case must surface as needing attention (visible to `004-admin-insights`).
- A question has only one reference answer and a valid alternate phrasing is submitted → must not be graded as clearly wrong solely because of wording (Story 2, Scenario 2) — this is why FR-009 requires supporting more than one reference answer.
- Advisory flag (negation mismatch / keyword stuffing / degenerate answer) fires on a genuinely correct, well-written answer → since flags are audit-only (Clarifications), this never changes the grade; it only adds a note for later human review if disputed.
- A Student submits an empty answer, a one-word answer, or an answer far longer than any reasonable response (potentially padded/repetitive) → grading MUST still complete and produce a score (FR-011); a low score from a genuinely inadequate answer is an expected, correct outcome, not a failure — the failure case being guarded against here is the *pipeline* breaking, not the *grade* being low.
- A Student submits an answer beyond the platform's maximum accepted length → handled per FR-012 (reject/truncate consistently), never as an unhandled error.

---

## Requirements *(mandatory)*

### Functional Requirements

**Scoring Contract**
- **FR-001**: Every graded question MUST produce a normalized per-question score in the closed interval [0, 1] — 0 meaning no credit, 1 meaning full credit — regardless of question type or grading mechanism.
- **FR-002**: MCQ questions MUST produce exactly 0 or 1, never an intermediate value (consistent with no partial credit and no negative marking).
- **FR-003**: Essay questions MUST produce a continuous score anywhere within [0, 1] reflecting the grading mechanism's assessed similarity — it MUST NOT be collapsed into a small fixed set of discrete buckets.
- **FR-004**: A question's contribution to an attempt's total score MUST be its normalized [0, 1] score multiplied by that question's point weight (defined on `001-foundation`'s Question entity); the attempt's total score is the sum of these contributions across all questions.
- **FR-004c**: The total score MUST be reportable both as raw points achieved out of the maximum possible points for that exam, and as a percentage (points achieved ÷ maximum possible points × 100) — e.g. 5 questions worth 1/1/5/5/... points totaling a 12-point maximum, a student scoring 9.5, is reported as both "9.5 / 12" and "79.17%".
- **FR-005**: Any "correct/incorrect" classification used for reporting (e.g. an admin-facing correct-vs-incorrect count) MUST be derived by applying a threshold to the stored normalized score for display purposes only — the raw normalized [0, 1] score MUST always be retained regardless of any threshold applied on top of it.

**Grading Behavior**
- **FR-006**: System MUST grade essay answers as a single holistic score per question (not sub-criteria) in this phase.
- **FR-007**: System MUST grade essay answers server-side, fully automatically, with no routine human review required before a grade is finalized.
- **FR-008**: System MUST grade deterministically: the same answer, against the same reference answer(s) and the same grading configuration/model version, MUST always produce the same score.
- **FR-009**: System MUST support more than one reference answer per essay question. Where multiple reference answers exist, the student's answer MUST be compared against each, and the **highest similarity score among all valid reference answers** MUST be used as that question's raw score — e.g. Reference A → 0.62, Reference B → 0.91, Reference C → 0.74 yields a raw score of 0.91.
- **FR-010**: System MUST NOT use an uncalibrated or default scoring threshold to grade a real student — any threshold used for reporting (FR-005) or pass/fail classification MUST have been calibrated against a representative answer sample beforehand, and that calibration basis MUST be recorded.

**Handling Degenerate Answers**
- **FR-011**: The grading mechanism MUST produce a valid score — never crash, error out, or leave a question ungraded — for empty, extremely short, excessively long, or suspiciously repetitive essay answers, exactly as it would for any ordinary answer.
- **FR-012**: System MUST enforce a maximum accepted answer length, beyond which further input is rejected or truncated consistently and predictably; this MUST NOT cause a grading failure. The specific limit is a `plan.md` detail.
- **FR-013**: An empty or extremely short answer MAY legitimately receive a low score on its own merits, but MUST NOT cause the grading pipeline to fail, hang, or block the rest of the attempt from being graded.

**Advisory Flags & Exposure**
- **FR-014**: System MAY compute advisory flags for later review only — e.g. a likely negation/contradiction between an answer and its reference, a likely keyword-stuffing pattern, or a suspiciously empty/short/long/repetitive answer.
- **FR-015**: System MUST NOT include correct-choice or reference-answer data in any response generated as part of grading that could reach a Student.
- **FR-016**: An advisory flag from FR-014 MUST NOT block, delay, or alter automatic grade finalization in any way.

**Auditability & Reliability**
- **FR-017**: System MUST log, for every graded essay answer, at minimum: the exact student answer text graded; every reference answer it was compared against and each one's individual similarity score (not only the winning one — e.g. Reference A: 0.62, Reference B: 0.91, Reference C: 0.74); which reference answer was selected as the match and why (highest score, per FR-009); the resulting raw normalized score; the model/configuration version used; the calibrated threshold(s) in effect at that time (FR-010) if a threshold-derived classification (FR-005) was shown anywhere; any advisory flags raised (FR-014); and a timestamp. This exact field list is the minimum bar for "explainable" in SC-004.
- **FR-018**: If a grading pass fails or times out, system MUST retry it a bounded number of times and MUST NOT leave the attempt silently and permanently ungraded; a still-failing case MUST become visible for admin attention.
- **FR-019**: System MUST support an Admin overriding a finalized grade after the fact, recording who made the override, when, and why.
- **FR-019a**: The original automatically-generated score MUST remain preserved and retrievable after an override — an override MUST NOT overwrite or delete the original grading record (FR-017); it MUST be stored as an additional, clearly-labeled entry alongside it, not in place of it.
- **FR-019b**: Once an override is applied, the overridden value — not the original automatic value — MUST be used in the attempt's total score calculation (FR-004/FR-020) going forward.
- **FR-019c**: A Student viewing a result that includes an overridden question MUST be able to see that it was manually reviewed/adjusted, so the score they see is never silently different from what was originally computed without any indication that a change occurred.
- **FR-020**: System MUST calculate and store a total attempt score, computed per FR-004, once every question in the attempt has a grade; this total MUST be recomputed whenever an override (FR-019b) changes an underlying question score.

### Key Entities

- **Reference Answer** — one of possibly several acceptable model answers for an essay question (owned by this spec; the parent `Question` entity, including its point weight used in FR-004, is owned by `001-foundation`).
- **Grading Log** — the audit record described in FR-017, one per graded essay answer.
- *(`Exam Attempt` and `Answer` are owned by `001-foundation`; this spec populates each `Answer`'s normalized [0, 1] score per FR-001.)*

---

## Success Criteria *(mandatory)*

- **SC-001**: 100% of submitted/auto-submitted attempts reach a fully-graded state, with no attempt permanently stuck due to a grading failure.
- **SC-002**: Grading the same answer against the same configuration twice, under test, produces the identical score every time.
- **SC-003**: Zero instances, under test, of a grading response exposing a correct choice or reference answer to a student-reachable endpoint.
- **SC-004**: For any graded essay answer under test, an Admin can retrieve every field listed in FR-017 (answer text, all reference scores, selected match, raw score, model version, threshold in effect, flags, timestamp) from stored records alone — "explained" means this exact field set is present and retrievable, not merely that a final score number exists.
- **SC-005**: Threshold calibration is completed and recorded before the mechanism is used to grade any real student's exam.
- **SC-006**: Under test, 100% of empty, extremely short, excessively long, and repetitive essay answers are graded without a pipeline failure, each producing a valid score in [0, 1].
- **SC-007**: Under test, every graded question's stored score is a value in [0, 1] — MCQ exactly 0 or 1, essay any value in that range — with no instance of a raw score falling outside the contract or of the raw value being discarded in favor of only a binary label.

---

## Assumptions

- The specific grading mechanism (currently local embedding-based semantic similarity; possibly an LLM-based fallback in a later phase) is a `plan.md` decision, not fixed by this spec — every requirement here is written to hold regardless of which mechanism computes the score.
- The specific numeric threshold(s) referenced in FR-005/FR-010 are a calibration/`plan.md` detail, not a fixed value in this specification.
- "Bounded retry" (FR-018) and "representative sample" (FR-010) sizing are `plan.md`/operational decisions.
- The maximum accepted answer length (FR-012) and the specific heuristics used to flag degenerate answers (FR-014) are `plan.md`/calibration details, not fixed by this specification — this spec only requires that such handling exists and never fails the pipeline.
