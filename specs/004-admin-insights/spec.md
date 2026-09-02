# Feature Specification: Testo — Admin Monitoring & Insights

**Feature Branch**: `004-admin-insights`
**Created**: 2026-08-28
**Status**: Draft
**Depends on**: `001-foundation` (attempts, students, groups) and `002-automated-grading` (scores, grading audit logs, override mechanism)
**Input**: Conversational elicitation — live exam monitoring, results/statistics review, and the admin-facing action of voiding or overriding a problematic attempt.

This spec covers the Admin's view into what is happening and what already happened — it does not define how grading itself works (`002-automated-grading` owns that guarantee) or how notifications are sent (`003-notifications`).

---

## Constitution Alignment

| Principle | How this spec satisfies it |
|---|---|
| **IV — Data Integrity and Resilience** | Exposes the Admin-only `voided` transition defined in `001-foundation`'s state machine, always with a recorded reason (FR-005). |
| **X — Automated Grading Integrity, Auditability, and Adversarial Resistance** | Surfaces the grading audit trail (`002-automated-grading`'s Grading Log) to the Admin and exposes the grade-override action that principle requires exist (FR-004). |
| **III — Defense in Depth for Exam Access** *(access-control spirit)* | This entire spec is reachable only by the Admin role — a Student MUST NOT be able to reach any view or data defined here (FR-007) — **and** every view/action here is further scoped to exams the requesting Admin owns (`001-foundation`'s FR-010c); one Admin MUST NOT see or act on another Admin's exam data (FR-007a). |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Admin Monitors Live Exam Activity (Priority: P2)

While one of their own exams is open, an Admin can see which permitted students have started, are in progress, or have submitted.

**Acceptance Scenarios**:
1. **Given** an exam the Admin owns is currently open, **When** they view it, **Then** they see each permitted student's current attempt status (`pending` / `in_progress` / `submitted` / `auto_submitted` / `abandoned`).
2. **Given** an exam owned by a different Admin, **When** they try to view it, **Then** access is denied, identically to a non-Admin attempting the same thing.

---

### User Story 2 — Admin Reviews Aggregate and Individual Results (Priority: P2)

Once attempts on one of an Admin's own exams are graded, that Admin can see exam-wide statistics and drill into any individual student's answers and score for that exam.

**Acceptance Scenarios**:
1. **Given** an exam the Admin owns has one or more graded attempts, **When** they view its results, **Then** they see the average, highest, and lowest scores across all graded attempts for that exam.
2. **Given** a specific student's graded attempt on an exam the Admin owns, **When** they open it, **Then** they see that student's individual answers, per-question correctness, and total score.
3. **Given** a specific graded essay answer on an exam the Admin owns, **When** they open it, **Then** they see its full grading record (`002-automated-grading`'s Grading Log — matched reference, raw score, any advisory flags) needed to understand how it was scored.

---

### User Story 3 — Admin Voids or Overrides a Problematic Attempt (Priority: P2)

When something has gone wrong with a specific attempt on one of an Admin's own exams (a technical error, an interrupted attempt, or a disputed grade), that Admin can correct it through a documented, audited action rather than an unlogged manual data edit.

**Acceptance Scenarios**:
1. **Given** an attempt in any non-`pending` state on an exam the Admin owns, **When** they void it, **Then** it transitions to `voided` and the reason and acting Admin are recorded.
2. **Given** a finalized grade on an exam the Admin owns that they believe is wrong, **When** they override it, **Then** the new grade, the reason, and the acting Admin are recorded, and the original automatic grade remains visible in the record (not erased).

---

## Edge Cases

- An Admin attempts to void a `pending` attempt (nothing has happened yet) → this is not a meaningful action and should be prevented or treated as a no-op rather than a data-integrity risk.
- Two Admins might seem to independently review "the same disputed attempt" — but since every exam has exactly one owning Admin (`001-foundation` FR-010c), this cannot happen across different Admins; only the owning Admin can reach it. What can occur is that *same* owning Admin taking two actions in quick succession — both must be individually recorded (who did what and when), not silently overwritten.
- A non-Admin (Student) attempts to reach any screen or data defined in this spec → must be denied entirely.
- An Admin attempts to reach any screen or data defined in this spec for an exam owned by a *different* Admin → must be denied entirely, identically to a non-Admin's attempt (FR-007a).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an Admin to view, for an open exam **they own**, each permitted student's current attempt status.
- **FR-002**: System MUST allow an Admin to view exam-wide aggregate statistics (average, highest, lowest score) for an exam **they own**, once graded attempts exist.
- **FR-003**: System MUST allow an Admin to view any individual student's answers, per-question correctness, and total score for a graded attempt on an exam **they own**.
- **FR-004**: System MUST allow an Admin to view the full grading record (matched reference answer, raw score, advisory flags, model/config version, timestamp) for any graded essay answer on an exam **they own**.
- **FR-005**: System MUST allow an Admin to transition any non-`pending` attempt on an exam **they own** to `voided`, recording the reason and the acting Admin.
- **FR-006**: System MUST allow an Admin to override a finalized grade on an exam **they own**, recording the new grade, the reason, and the acting Admin. This action MUST satisfy `002-automated-grading`'s full override contract: the original automatic grade is preserved (its FR-019a), the attempt's total score recalculates (its FR-019b/FR-020), the Student's result view reflects the change with a "manually reviewed" indicator (its FR-019c), and a follow-up notification fires if the result was already sent (`003-notifications` FR-004a).
- **FR-007**: System MUST NOT allow any user without the Admin role to reach any view or data defined in this spec.
- **FR-007a**: System MUST NOT allow an Admin to reach any view or data defined in this spec for an exam they do not own — every FR above (FR-001–FR-006) is implicitly scoped to "exams this Admin owns," and this MUST be enforced identically to the Student/Admin role check in FR-007, not treated as a lesser restriction.

### Key Entities

*(No new entities — this spec is a read/administrative-action layer over `Exam Attempt` and `Answer` from `001-foundation` and `Grading Log` from `002-automated-grading`.)*

---

## Success Criteria *(mandatory)*

- **SC-001**: An Admin can locate any specific student's result and its full grading explanation, for any exam they own, without developer assistance.
- **SC-002**: Every void or override action, under test, produces a complete, attributable audit record — zero silent corrections.
- **SC-003**: Zero instances, under test, of a non-Admin reaching any screen or endpoint defined in this spec.
- **SC-004**: Zero instances, under test, of one Admin reaching another Admin's exam data, monitoring view, results, or override/void actions through any screen or endpoint defined in this spec.

---

## Assumptions

- Enforcement of "Admin-only" access (FR-007) is a `plan.md`/access-control implementation detail (e.g. row-level policy); this spec only requires that the guarantee holds.
