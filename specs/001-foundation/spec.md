# Feature Specification: Testo — Foundation (Exam Lifecycle, Access & Presentation)

**Feature Branch**: `001-foundation`
**Created**: 2026-08-28
**Status**: Draft
**Depends on**: none (this is the base feature; `002-automated-grading`, `003-notifications`, and `004-admin-insights` all depend on the entities and states defined here)
**Input**: Conversational elicitation — exam creation/scheduling, groups and access control, secure timed exam-taking, attempt resilience, and bilingual/theme-adaptive presentation.

This spec covers everything needed for an Admin to create an exam and a Student to take it securely from start to close — **except** how answers are actually graded (`002-automated-grading`), how notifications are sent (`003-notifications`), and admin-side monitoring/analytics (`004-admin-insights`). It is the foundation the other three specs build on.

---

## Constitution Alignment

| Principle | How this spec satisfies it |
|---|---|
| **I — Server Is the Sole Source of Truth** | All exam timing/state checks (start, end, remaining time) are enforced server-side; the client timer is informational only (FR-014, FR-015). |
| **II — Zero Exposure of Grading Criteria** | The exam-taking view returned to a Student MUST NOT include correct-answer or reference-answer data at any point during an open attempt (FR-019). Grading itself is out of scope here — see `002-automated-grading`. |
| **III — Defense in Depth for Exam Access** | Access requires authentication (FR-007a, FR-010a) + authorization (Student/Admin role separation, FR-010b, and peer-Admin ownership isolation, FR-010c/FR-005a) + a unique, time-scoped attempt credential bound to that authenticated identity — not a bearer link usable by whoever holds it (FR-009, FR-009a) — all re-checked per request; only one active session per attempt is permitted at a time (FR-021a). |
| **IV — Data Integrity and Resilience** | Debounced autosave, explicit unsynced/offline handling, session-takeover-not-lockout on multi-device access (FR-021a), exam content/timing immutability once any attempt begins (FR-004a — no student may be graded against different questions or criteria than another student of the same exam), and the full attempt state machine (`pending → in_progress → submitted | auto_submitted | abandoned`, plus Admin-only `voided`) are specified here in the exact terms the constitution uses (FR-015–FR-024). |
| **IX — Bilingual and Theme-Adaptive by Default** | User Story 6 and FR-037–FR-040 require every screen in this spec to work fully in Arabic/English and light/dark from day one. |

*(Principles V, VI, and X — notifications, cost tracking, and grading integrity — are not this spec's concern; see `003-notifications` and `002-automated-grading`.)*

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Admin Creates and Schedules an Exam (Priority: P1)

An Admin builds an exam with a title, MCQ and/or essay questions, a scheduled date/time and duration, then publishes it.

**Independent Test**: An Admin creates one exam with both question types and publishes it; it becomes visible as upcoming only to permitted students.

**Acceptance Scenarios**:
1. **Given** an Admin is creating an exam, **When** they add an MCQ question, **Then** it must have at least two choices and exactly one marked correct before saving.
2. **Given** an Admin is creating an exam, **When** they add an essay question, **Then** it must have at least one reference answer before saving.
3. **Given** an Admin publishes an exam, **When** publishing completes, **Then** it appears as upcoming only to its permitted students/groups.
4. **Given** a published exam that no student has started yet, **When** an Admin edits its questions, choices, correct answers, reference answers, duration, or scheduled time, **Then** the edit is applied and any not-yet-sent notifications (`003-notifications`) are recalculated accordingly.
5. **Given** a published exam where at least one attempt has reached `in_progress`, **When** an Admin tries to edit its questions, choices, correct answers, reference answers, duration, or start time, **Then** the edit is refused — that content is now locked for every student taking this exam.
6. **Given** a published exam where at least one attempt has reached `in_progress`, **When** an Admin adds a student or group to the permitted list, **Then** the addition succeeds, but removing a student who has already started MUST NOT affect their in-progress or completed attempt.
7. **Given** an exam created by one Admin, **When** a different Admin tries to view, edit, publish, or delete it, **Then** they cannot — an exam is only ever visible to and manageable by the Admin who created it.

---

### User Story 2 — Admin Manages Student Groups and Exam Access (Priority: P1)

An Admin organizes students into groups and grants exam access to individual students, whole groups, or a combination.

**Acceptance Scenarios**:
1. **Given** an Admin creates a group, **When** they assign a student to it, **Then** that student is a member for access purposes.
2. **Given** an Admin is publishing an exam, **When** they select groups and/or individual students, **Then** only those students can see or access it.
3. **Given** a student belongs to more than one group, **When** an exam is assigned to any of those groups, **Then** the student is permitted.
4. **Given** a group created by one Admin, **When** a different Admin tries to view, select, or assign students to it, **Then** they cannot — each Admin sees and manages only their own groups.
5. **Given** an Admin selecting groups while publishing an exam, **When** they search for or list available groups, **Then** only their own groups appear, never another Admin's.

---

### User Story 3 — Student Takes and Submits a Timed Exam (Priority: P1)

A permitted Student opens their exam during its scheduled window, answers questions, and submits — manually or automatically — without losing confirmed answers or accessing anything outside their own attempt.

**Independent Test**: A test student takes a mixed MCQ/essay exam end-to-end, including a simulated dropped connection, and the attempt closes correctly with all confirmed answers intact.

**Acceptance Scenarios**:
1. **Given** a permitted, published exam scheduled to start now, **When** the Student opens their link, **Then** they can see the questions and begin answering.
2. **Given** a Student answering, **When** they select an MCQ choice or type essay text, **Then** it is saved automatically (debounced — on selection, or after a short typing pause / on field blur), with no explicit per-question save action.
3. **Given** a Student's connection drops, **When** this happens, **Then** the interface clearly shows which answers are unsynced rather than falsely showing them as saved; any answer queued locally that reaches the server after the attempt's window has closed MUST be rejected.
4. **Given** a Student tries to open an exam link before its scheduled start or after its scheduled end (start time + duration — see FR-011a), **When** they try, **Then** access is denied.
5. **Given** a Student has already submitted, **When** they try to re-access the same attempt, **Then** they cannot re-enter it or change any answer.
6. **Given** two different students, **When** either takes their own exam, **Then** neither can see the other's in-progress state, answers, or results.
7. **Given** an exam scheduled 10:00–11:00 (start + 60-minute duration), **When** a Student opens their link at 10:20, **Then** they see and are enforced against the exam's fixed 11:00 deadline — they receive the ~40 minutes remaining, never a fresh 60-minute countdown from 10:20.
8. **Given** a Student forwards their exam link to another person, **When** that other person opens it while authenticated as their own (different) account, **Then** access is denied — the link only works for the exact account it was issued to (FR-009a).

---

### User Story 4 — Exam Attempt Closes Automatically When Time Expires (Priority: P1)

Every attempt that reaches its scheduled end time is closed and handed off for grading by the system itself, without depending on the Student's browser staying open. (Grading itself is `002-automated-grading`'s responsibility — this story stops at "the attempt is correctly closed and queued.")

**Independent Test**: Start an attempt, close the browser before time expires, wait past the exam's end time, and confirm the attempt transitions to `auto_submitted` without any further client action.

**Acceptance Scenarios**:
1. **Given** an attempt's scheduled end time has passed, **When** the system next checks for expired attempts, **Then** it transitions to `auto_submitted` and becomes eligible for grading, regardless of client connectivity.
2. **Given** a Student never opens their exam link at all during the scheduled window, **When** the window closes, **Then** their attempt is recorded as `abandoned` — distinct from a submitted attempt, and never confused with a zero-scoring submission.

---

### User Story 5 — Student Views Their Own Result (Priority: P2)

Once an attempt has been graded (`002-automated-grading`), the Student can see their final score and per-question breakdown.

**Acceptance Scenarios**:
1. **Given** an attempt has finished grading, **When** the Student views it, **Then** they see their total score and a per-question breakdown.
2. **Given** an attempt is still awaiting grading, **When** the Student views it, **Then** the interface shows a pending state rather than an incomplete or misleading score.

---

### User Story 6 — Platform Works Fully in Arabic or English, Light or Dark (Priority: P1)

Every screen in this spec is fully usable in Arabic (RTL) and English (LTR), and in both light and dark themes, per the user's choice.

**Independent Test**: Exercise every screen from Stories 1–5 in both languages and both themes; layout, text, and legibility must all be correct in every combination.

**Acceptance Scenarios**:
1. **Given** any screen, **When** a user switches language, **Then** all text updates and layout direction mirrors correctly.
2. **Given** any screen, **When** a user switches theme, **Then** content remains fully legible and correctly styled.
3. **Given** a chosen language/theme, **When** the user logs out and back in later, on any device, **Then** their choice is still applied — it is tied to their account, not just the browser session.

---

## Edge Cases

- Connection drops and never returns before the window closes → confirmed-saved answers are kept and later graded; unsynced answers are lost, and the UI must have shown them as unsynced beforehand (Story 3, Scenario 3).
- Admin reschedules after some reminders already sent → not-yet-sent notifications recalculate; already-sent ones are not un-sent (a known limitation, not a defect).
- Admin attempts to edit a question, choice, correct answer, reference answer, duration, or start time after the first attempt has begun → refused entirely (FR-004a); the Admin must instead handle any error via `004-admin-insights`' voiding mechanism for affected attempts rather than editing live exam content.
- Same attempt opened in two tabs/devices while `in_progress` → the newly-opened session takes over as the active one; the prior session is invalidated for further interaction, though its already-confirmed-saved answers are kept (FR-021a). This is a takeover, not a silent duplicate — only one session can act on the attempt at any moment.
- Student never opens their link → recorded as `abandoned`, never as a zero-scoring `submitted`/`auto_submitted` attempt (Story 4, Scenario 2).
- Student opens their link partway through the exam window (e.g. 20 minutes after start on a 60-minute exam) → they get only the time remaining until the exam's fixed deadline (start + duration), never a fresh full-duration countdown from their own start (Story 3, Scenario 7; FR-011a).
- Student attempts to open their link after the exam's fixed deadline has already passed, even by a few seconds → access is denied outright, same as any other post-deadline attempt (FR-011); the system does not grant a token that would open with zero or negative remaining time.

---

## Requirements *(mandatory)*

### Functional Requirements

**Exam Creation & Management**
- **FR-001**: System MUST allow an Admin to create an exam with a title, description, scheduled start date/time, and duration.
- **FR-002**: System MUST allow an Admin to add MCQ questions (≥2 choices, exactly one correct) and essay questions (≥1 reference answer).
- **FR-002a**: Every question MUST have a point weight assigned by the Admin, used to compute the exam's total score (`002-automated-grading` FR-004/FR-004c); if the Admin does not set one explicitly, it MUST default to a defined value (e.g. 1 point) rather than being left undefined.
- **FR-002b**: System MUST reject an empty question text, an empty choice, or an empty reference answer. Within a single MCQ question, System MUST reject duplicate choice text. System MUST enforce a reasonable maximum number of choices per question and a reasonable maximum length for question text, choice text, and reference-answer text — the specific numeric limits are `plan.md` details.
- **FR-002c**: System MUST safely render (never execute) any user-supplied text — question text, choices, reference answers, and student essay answers alike — preventing script injection regardless of what characters or markup a Student or Admin includes.
- **FR-003**: System MUST allow an Admin to publish an exam, making it visible only to its permitted students/groups.
- **FR-004**: Before any attempt for an exam has begun, System MUST allow an Admin to edit its questions, choices, correct answers, reference answers, point weights, duration, or scheduled start time, and MUST recalculate any not-yet-sent notifications against the new schedule.
- **FR-004a**: Once the first attempt for an exam has transitioned to `in_progress`, its content and timing MUST become immutable: questions, choices, correct answers, reference answers, point weights, question count/order, duration, and scheduled start time MUST NOT be editable thereafter — this guarantees every student taking that exam experiences identical content and conditions.
- **FR-004b**: After the first attempt has begun, an Admin MAY still add students or groups to a published exam's permitted list, but MUST NOT be able to revoke a student's permission in a way that invalidates, blocks, or interferes with an attempt that student has already started.

**Groups & Access**
- **FR-005**: System MUST allow an Admin to create groups and assign students to one or more groups. Each group MUST be owned by the Admin who created it.
- **FR-005a**: An Admin MUST only be able to view, edit, or assign students to groups they own — not groups created by another Admin.
- **FR-006**: System MUST allow exam access to be granted at the individual-student level, the group level (restricted to groups the exam's owning Admin themselves owns, per FR-005a), or both.

**Student Authentication & Account Security**
- **FR-007**: System MUST allow a Student to register and use one persistent account across all exams.
- **FR-007a**: System MUST require a Student to authenticate (log in) before accessing any account-specific data, including their upcoming/past exams, results, or an exam attempt.
- **FR-007b**: System MUST allow a Student to log out, ending their authenticated session immediately.
- **FR-007c**: System MUST provide a way for a Student to reset a lost/forgotten password without Admin intervention.
- **FR-007d**: A Student's authenticated login session MUST expire after a period of inactivity or a maximum duration, requiring re-authentication — this is separate from, and in addition to, the per-attempt session rule in FR-021a.

**Student Exam Access**
- **FR-008**: System MUST allow a logged-in Student to view upcoming exams they are permitted to take, and their own past exams/scores/statistics.
- **FR-009**: System MUST grant access to a specific attempt only via a unique credential/link issued to that specific student for that exam, valid only within its scheduled window, **and** MUST require the person using that link to be authenticated as the exact Student account it was issued to. The link alone — without matching authentication — MUST NOT be sufficient to access or take the exam.
- **FR-009a**: If a Student's exam link is opened by someone authenticated as a different account (e.g. the link was forwarded to another person), access MUST be denied, even though the link/token itself is otherwise valid and unexpired.
- **FR-010**: System MUST prevent any student from accessing another student's in-progress answers, submitted answers, or results.

**Admin Authentication & Authorization**
- **FR-010a**: System MUST require an Admin to authenticate (log in) before accessing any Admin-only capability (exam creation/editing, viewing student data, grading overrides, etc.), with the same logout, password-reset, and session-expiration guarantees as FR-007a–FR-007d.
- **FR-010b**: System MUST NOT allow a Student-role account to reach any Admin-only action or view under any circumstance — this is the foundational guarantee that `004-admin-insights`' access restriction (its FR-007) relies on.
- **FR-010c**: Every exam MUST be owned by the Admin account that created it. An Admin MUST only be able to view, edit, publish, monitor, or manage exams they own — attempting to reach another Admin's exam MUST be denied exactly as if the requester were unauthorized, regardless of that requester also holding the Admin role. There is no cross-Admin or "super admin" visibility in this phase (see Assumptions).

**Taking an Exam**
- **FR-011**: System MUST prevent starting an attempt before its scheduled start or after its scheduled end.
- **FR-011a**: An exam's end time MUST be defined as exactly its scheduled start time plus its duration (`end_time = start_time + duration`) — there is no separately-set end time, and this single fixed deadline applies to every student equally.
- **FR-011b**: A Student who opens their exam link after its scheduled start time MUST receive only the time remaining until the exam's fixed end time (FR-011a) — never a fresh full-duration countdown measured from their own start. A Student whose start would leave zero or negative remaining time MUST be denied access outright, consistent with FR-011.
- **FR-012**: System MUST display remaining time to the Student for informational purposes, computed per FR-011a/FR-011b.
- **FR-013**: System MUST independently track and enforce the actual remaining time (per FR-011a/FR-011b) on its own, regardless of the Student's device/clock.
- **FR-014**: System MUST save each answer automatically via a debounced trigger (MCQ selection; essay text after a short typing pause or on blur) — never on every keystroke.
- **FR-015**: System MUST indicate in real time whether an answer is confirmed saved or still unsynced.
- **FR-016**: System MUST reject any answer reaching the system after that attempt's window has closed, even if queued locally beforehand.
- **FR-017**: System MUST allow a Student to manually submit before time expires.
- **FR-018**: System MUST automatically transition any attempt whose time has expired to `auto_submitted`, independent of client connectivity.
- **FR-019**: System MUST NOT include correct-answer or reference-answer data in any response used to render the exam-taking screen, at any point during an open attempt.
- **FR-020**: System MUST enforce the attempt lifecycle exactly as: `pending` (issued, not yet opened) → `in_progress` → one of `submitted`, `auto_submitted`, or `abandoned`; only an Admin may move a non-`pending` attempt to `voided`, with a recorded reason (see `004-admin-insights`).
- **FR-020a**: A `pending` attempt MUST be created for every permitted Student at the moment an exam's scheduled start time arrives — every permitted Student has a tracked attempt from that point on, whether or not they ever open their link. If a Student is added to an already-started exam's permitted list (FR-004b), a `pending` attempt MUST be created for them immediately at the moment that permission is granted.
- **FR-020b**: A `pending` attempt whose exam window closes without ever reaching `in_progress` MUST transition to `abandoned` (Story 4, Scenario 2) — `abandoned` is only reachable from `pending`, never from `in_progress` (an attempt that was started and then disconnected follows FR-018 into `auto_submitted` instead, per the offline-handling rules already defined).
- **FR-021**: System MUST prevent an attempt from being taken, resumed, or resubmitted more than once after it reaches `submitted`/`auto_submitted`/`abandoned`/`voided`.
- **FR-021a**: While an attempt is `in_progress`, System MUST allow only one active session for it at a time. If the same attempt is opened from a new session (new tab, browser, or device), the new session MUST take over as the active one and the prior session MUST be invalidated for further interaction — answers already confirmed saved (FR-015) are preserved regardless of which session saved them.
- **FR-021b**: System MAY detect and log when a Student's browser loses focus, is minimized, or exits fullscreen during an `in_progress` attempt, as a non-blocking audit signal for later review. This detection MUST NOT pause, block, or otherwise automatically penalize the attempt — it cannot reliably distinguish legitimate cause from misuse and is not a substitute for real proctoring (see Assumptions).

**Results (student-facing)**
- **FR-022**: System MUST make a Student's total score and per-question breakdown available to that Student once grading (`002-automated-grading`) is complete, and MUST show a clear pending state before that.

**Presentation & Language**
- **FR-023**: System MUST present all Student/Admin interface content in both Arabic and English, switchable by the user.
- **FR-024**: System MUST correctly mirror layout/direction for Arabic (RTL) vs. English (LTR).
- **FR-025**: System MUST offer both light and dark themes, switchable and consistently applied.
- **FR-026**: System MUST persist a user's language/theme choice across sessions, tied to their account — a returning user who logs in on any device sees their last-chosen language and theme, not a reset default. Before any explicit choice is made, the system MAY fall back to the browser/device's own language/theme preference.

### Key Entities

- **Student**, **Admin** — as described in the overview.
- **Group** — a named collection of students, owned by exactly one Admin (FR-005).
- **Exam** — title, description, schedule, duration, questions, permitted students/groups; owned by exactly one Admin (FR-010c).
- **Question** — MCQ (choices + one correct) or Essay (reference answer(s)); carries a point weight/mark used to compute total attempt score (see `002-automated-grading`'s scoring contract); *how* it is graded belongs to `002-automated-grading`.
- **Exam Attempt** — one student's instance of one exam; owns the state machine (`pending / in_progress / submitted / auto_submitted / abandoned / voided`).
- **Answer** — a student's given response within an attempt; its resulting correctness/score is populated by `002-automated-grading`, not defined here.

---

## Success Criteria *(mandatory)*

- **SC-001**: A Student can complete taking an exam end-to-end without help, on the first attempt.
- **SC-002**: 100% of expired attempts transition to `auto_submitted` regardless of client disconnection.
- **SC-002a**: In testing, 100% of late-starting students are enforced against the exam's fixed end time (start + duration), never granted extra time beyond it.
- **SC-002b**: In testing, 100% of attempted edits to an exam's content or timing after its first attempt has begun are refused, with zero instances of a student being graded against different criteria than another student of the same exam.
- **SC-002c**: In testing, zero instances of an exam link granting access when opened by anyone authenticated as an account other than the one it was issued to.
- **SC-002d**: In testing, zero instances of an Admin viewing, editing, or managing an exam or group owned by a different Admin.
- **SC-003**: Zero instances, under test, of a student seeing another student's data or any correct-answer/reference-answer data during their own open attempt.
- **SC-004**: An Admin can create, schedule, and publish a complete exam without developer assistance.
- **SC-005**: Every screen in this spec is fully usable, with no missing translations or illegible content, in both languages and both themes.

---

## Assumptions

- Initial scale target: on the order of 100–300 concurrent students per exam.
- Interface chrome must be bilingual (FR-023); exam **content** itself follows whatever language the Admin authored it in — auto-translation of exam content is out of scope.
- Whether a minimum grace period exists (e.g. refusing entry if fewer than 1–2 minutes remain, even though technically still before the deadline) is an open product decision, not fixed by this spec; FR-011b as written permits entry down to the last available second unless this is decided otherwise.
- True exam lockdown/proctoring — preventing screenshots, preventing tab switches or window exits, or webcam monitoring — is not achievable through a standard web browser (no web API grants that control over the OS/browser chrome) and is explicitly out of scope for this phase. FR-021a (single active session) and FR-021b (non-blocking activity logging) are the full extent of this spec's integrity measures beyond the grading-time protections already defined; a dedicated native proctoring solution would be a separate, materially larger feature, not a Phase 1 requirement.
- Full content **versioning** (allowing edits after an exam has started, with each attempt graded against whichever version it actually saw) is deliberately not pursued in this phase — FR-004a's simple immutability achieves the same fairness guarantee with far less complexity, at the cost of an Admin needing to fix a genuine error by voiding affected attempts (`004-admin-insights`) rather than live-editing the exam. Versioning may be reconsidered later if immutability proves too restrictive in practice.
- Every exam and every group is owned by exactly one Admin account (FR-005/FR-010c); there is no shared/cross-Admin visibility and no "super admin" role with platform-wide access in this phase. If a future need arises for a platform-wide administrative view (e.g. a single organization operator overseeing multiple instructors), that would be a new, explicitly-scoped capability, not an extension of the existing Admin role.
- The specific authentication mechanism (password-based login, magic link, a third-party identity provider, etc.) and password/session-expiration policy specifics are `plan.md` implementation details — this spec only requires that authentication exists, is independently verified per request, and is never satisfied by a link/token alone.
- Data retention duration, account deletion (a Student or Admin closing their account and what happens to their exam history), data export (a Student obtaining a copy of their own data), and platform-level access logging (who viewed what, beyond the grading-specific audit trail already required by Principle X) are explicitly **not defined by this spec** and are deferred — not silently omitted. These are real requirements for a production system handling personal data, but are treated as a follow-up spec once Phase 1's core loop is validated, consistent with Principle VII's MVP discipline. Access **scoping** itself (a Student sees only their own data; an Admin sees only their own exams/groups) is already fully specified above (FR-010, FR-005a, FR-010c) and is not part of this deferral.
- This spec deliberately stops at "attempt is closed and awaiting grading" and "result is shown once graded" — the grading computation itself, notification sending, and admin analytics are covered in the other three specs.
