# Feature Specification: Testo — Notifications

**Feature Branch**: `003-notifications`
**Created**: 2026-08-28
**Status**: Draft
**Depends on**: `001-foundation` (exam schedule, permitted students) and `002-automated-grading` (the "result ready" trigger for the result email)
**Input**: Conversational elicitation — automatic email reminders, exam-start link, and result delivery, with no manual admin action required.

This spec covers **only** the sending, logging, and reliability of student-facing email notifications. It does not define exam content, grading, or the admin dashboard.

---

## Constitution Alignment

| Principle | How this spec satisfies it |
|---|---|
| **V — Every Automated Notification Is Logged, Deduplicated, and Retried** | This principle is this spec's entire basis: every send attempt is logged with a status (FR-005), scheduled sends are idempotent (FR-006), and failures retry a bounded number of times using an idempotent notification identity to minimize duplicates (FR-005) — an honest framing given email delivery's inherent uncertainty, rather than an absolute guarantee this system cannot actually make. |
| **VI — Cost-Conscious, Usage-Driven Scaling** | The daily sending limit is tracked and proactively surfaced to the Admin *before* an exam is published (FR-007) — not discovered after a failure. |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Student Receives Timely Email Notifications (Priority: P2)

A Student is emailed a reminder a day before their exam, a reminder an hour before, their access link at the exam's start, and their result once grading completes — without any manual action from the Admin.

**Why this priority**: Important for attendance and experience, but the platform remains functional (an Admin could announce manually) without it, unlike the foundation and grading specs.

**Independent Test**: Publish an exam scheduled far enough ahead to observe all four notification triggers fire correctly for a test student.

**Acceptance Scenarios**:
1. **Given** a Student permitted for a published, scheduled exam, **When** approximately 24 hours remain, **Then** they receive a reminder email.
2. **Given** the same exam, **When** approximately 1 hour remains, **Then** they receive a second reminder email.
3. **Given** the exam's scheduled start arrives, **When** it begins, **Then** the Student receives an email with their access link.
4. **Given** an attempt finishes grading (`002-automated-grading`), **When** grading completes, **Then** the Student receives an email with their result.
5. **Given** any of the above emails fails to send, **When** the failure is detected, **Then** it is retried automatically, using an idempotent notification identity so the system's own logic never *decides* to send the same notification twice (FR-005).
6. **Given** a finalized grade is overridden after its result email was already sent, **When** the override is applied, **Then** the Student receives a follow-up notification that their result was updated (FR-004a).

---

## Edge Cases

- Daily sending limit would be exceeded on a day with multiple scheduled exams → this MUST be visible to the Admin before publishing, not discovered as a delivery failure afterward (FR-007).
- Exam rescheduled after some reminders already sent → not-yet-sent notifications recalculate against the new time (owned by `001-foundation`'s FR-004); already-sent notifications for the old time are not un-sent.
- A notification send fails permanently after all retries → this MUST remain visible in the delivery log rather than silently disappearing.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST *attempt* to send an eligible Student a reminder email approximately 24 hours before an exam they are permitted to take. (This is an obligation to attempt/retry, not a delivery guarantee — see SC-001 for the delivery-outcome target, which is necessarily lower than 100% since actual delivery depends on factors outside the system's control, such as an invalid address or the receiving provider's availability.)
- **FR-002**: System MUST attempt to send an eligible Student a reminder email approximately 1 hour before that exam, under the same terms as FR-001.
- **FR-003**: System MUST attempt to send an eligible Student an email containing their access link at the exam's scheduled start time, under the same terms as FR-001.
- **FR-004**: System MUST attempt to send an eligible Student an email with their result once their attempt is graded (`002-automated-grading`), under the same terms as FR-001.
- **FR-004a**: If a finalized grade is later overridden (`002-automated-grading`'s FR-019) after the original result notification for that attempt has already been sent, System MUST send a follow-up notification informing the Student that their result was updated.
- **FR-005**: System MUST record the delivery status (pending/sent/failed) of every notification and retry a failed one a bounded number of times. System MUST use an idempotent notification identity (e.g. one logged record per student+exam+event, checked before any send) to minimize duplicate sends — this bounds the system's own sending *decision* to be consistent and non-repeating, though it cannot guarantee against a duplicate caused by a lost delivery acknowledgment from the email provider itself (an inherent limitation of email as a transport, not a gap in this system's logic).
- **FR-006**: A scheduled/recurring check for due notifications MUST be idempotent — re-running it MUST NOT re-send anything already logged as sent.
- **FR-007**: System MUST track projected daily notification volume against the platform's sending limit and surface this to the Admin before an exam is published, if publishing would risk exceeding it.

### Key Entities

- **Notification** — a single logged send (or attempt) for one student, one exam-related event, with its delivery status and timestamp. References `Student` and `Exam` (`001-foundation`) and the grading-complete event (`002-automated-grading`).

---

## Success Criteria *(mandatory)*

- **SC-001**: 100% of due notifications are attempted (and retried on failure per FR-005) by the system — this is a send-attempt guarantee.
- **SC-001a**: At least 95% of scheduled reminder and result emails for a given exam are successfully *delivered* — a lower, separate target from SC-001, since delivery success depends on factors (invalid addresses, provider downtime) outside the system's control.
- **SC-002**: Zero instances, under test, of the system's own logic *deciding* to send the same notification twice for the same student+exam+event, including when the scheduler is re-run (FR-005's idempotent-identity guarantee; this does not cover a duplicate caused by the email provider itself losing a delivery acknowledgment, which is outside this system's control).
- **SC-003**: The Admin always knows the projected daily notification volume for a day with multiple exams before publishing, not after a failure.

---

## Assumptions

- "Approximately 24 hours" / "approximately 1 hour" allow a small scheduling tolerance (on the order of minutes).
- The exact numeric daily sending limit and the provider used are `plan.md` details, not fixed here.
