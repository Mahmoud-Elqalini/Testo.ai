# Tasks: 001-foundation

**Input**: Design documents from `/specs/001-foundation/`

**Prerequisites**: plan.md ✅, spec.md ✅, data-model.md ✅, contracts/ ✅, research.md ✅, quickstart.md ✅

**Tests**: Included per Constitution Principle VIII (Strict TDD for Logic; Visual Regression Testing for Presentation).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

## Path Conventions

- **Frontend**: `src/` (Next.js App Router — `src/app/`, `src/components/`, `src/lib/`, `src/locales/`, `src/styles/`)
- **Backend**: `supabase/functions/` (Edge Functions), `supabase/migrations/` (already done ✅)
- **Tests**: `tests/unit/` (Vitest TDD), `tests/visual/` (Playwright VRT)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize Next.js project, configure tooling, and establish the development environment.

- [ ] T001 Initialize Next.js (App Router) project with TypeScript at repo root: `npx -y create-next-app@latest ./ --typescript --app --eslint --src-dir --import-alias "@/*"` — configure `tsconfig.json` path aliases
- [ ] T002 Install core dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `@tanstack/react-query` (per research.md state management decision)
- [ ] T003 [P] Install and configure Tailwind CSS with RTL plugin (`tailwindcss-rtl` or built-in `rtl:` modifier), dark mode (`class` strategy), and custom color palette in `tailwind.config.ts`
- [ ] T004 [P] Install and configure Vitest (`vitest`, `@testing-library/react`, `@testing-library/jest-dom`) — create `vitest.config.ts`
- [ ] T005 [P] Install and configure Playwright for visual regression testing — create `playwright.config.ts` with multi-browser setup
- [ ] T006 [P] Create `.env.local.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` placeholders, add `.env.local` to `.gitignore`
- [ ] T007 Create project directory structure per plan.md: `src/app/`, `src/components/`, `src/lib/`, `src/locales/`, `src/styles/`, `tests/unit/`, `tests/visual/`

**Checkpoint**: Project initializes, `npm run dev` starts without errors, Vitest and Playwright run empty suites.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

> [!CAUTION]
> No user story work can begin until this phase is complete.

### 2A — Supabase Client & Auth Framework

- [ ] T007a Reconcile all live SQL-Editor patches applied during manual debugging into the actual migration files: verify 0003_functions_triggers_cron.sql contains SET search_path = public, pg_temp on all 6 SECURITY DEFINER functions with public.-qualified table references; verify fn_protect_profile_role() checks current_user IN ('postgres','service_role') in addition to current_setting('role', true); verify 0001_schema.sql's exam_permissions_target_check uses XOR logic; verify all status literals across all three files use explicit ::attempt_status casts. Re-run all three migration files against a clean database (local or a fresh Supabase project) to confirm they succeed standalone, with no dependency on manual live patches.
- [ ] T008 Create Supabase browser client helper in `src/lib/supabase/client.ts` (uses `createBrowserClient` from `@supabase/ssr`)
- [ ] T009 Create Supabase server client helper in `src/lib/supabase/server.ts` (uses `createServerClient` from `@supabase/ssr` for Server Components / Route Handlers)
- [ ] T010 Create Supabase middleware in `src/middleware.ts` for session refresh on every request (per Supabase SSR docs)
- [ ] T011 Implement auth utility functions in `src/lib/auth.ts`: `signUp`, `signIn`, `signOut`, `resetPassword`, `getCurrentUser`, `getSession`
- [ ] T012 Write TDD tests for auth utilities in `tests/unit/lib/auth.test.ts` — test sign-in/sign-up/sign-out flows against a real local Postgres/Supabase instance (via Supabase CLI + Docker) rather than a mocked Supabase client. (Mocks cannot validate RLS, triggers, enum casts, and search_path behavior)

### 2B — i18n & Theming Infrastructure (Constitution IX)

- [ ] T013 Create i18n dictionaries: `src/locales/en.json` (English) and `src/locales/ar.json` (Arabic) — start with shared keys for auth pages, nav, common labels
- [ ] T014 Create i18n provider and `useTranslation` hook in `src/lib/i18n/provider.tsx` and `src/lib/i18n/use-translation.ts` — reads `preferred_language` from profile, falls back to browser locale
- [ ] T015 Create theme provider in `src/lib/theme/provider.tsx` — manages `light`/`dark` class on `<html>`, reads `preferred_theme` from profile, falls back to `prefers-color-scheme`
- [ ] T016 Create root layout `src/app/layout.tsx` with `dir` attribute (RTL/LTR based on language), theme class, and providers wrapping children
- [ ] T017 [P] Write TDD tests for i18n hook in `tests/unit/lib/i18n.test.ts` — verify key lookup, fallback behavior, language switching
- [ ] T018 [P] Write TDD tests for theme provider in `tests/unit/lib/theme.test.ts` — verify class toggling, persistence, fallback

### 2C — React Query Setup & Shared Utilities

- [ ] T019 Configure React Query provider in `src/lib/query/provider.tsx` — wrap app with `QueryClientProvider`, configure default stale/cache times
- [ ] T020 Create shared TypeScript types in `src/lib/types.ts` matching data-model.md entities: `Profile`, `Group`, `Exam`, `Question`, `McqChoice`, `ExamAttempt`, `Answer`, `AttemptStatus`, `UserRole`, `QuestionType`
- [ ] T021 Create shared error handling utility in `src/lib/errors.ts` — maps Supabase/Edge Function error responses to user-friendly messages (per error-policy.md)
- [ ] T022 [P] Create shared Edge Function caller utility in `src/lib/edge-functions.ts` — typed wrapper around `supabase.functions.invoke()` with error normalization

### 2D — Auth Pages (Login/Register/Reset)

- [ ] T023 Create login page at `src/app/login/page.tsx` — email/password form, calls `signIn`, redirects to dashboard on success
- [ ] T024 [P] Create registration page at `src/app/register/page.tsx` — email/password/full_name form, calls `signUp`
- [ ] T025 [P] Create password reset page at `src/app/reset-password/page.tsx` — email form, calls `resetPassword` (FR-007c)
- [ ] T026 Create auth guard middleware logic in `src/middleware.ts` — redirect unauthenticated users to `/login`, redirect authenticated users away from `/login` (FR-007a, FR-010a)
- [ ] T027 [P] Write Visual Regression Tests for auth pages in `tests/visual/auth.spec.ts` — capture snapshots in AR/EN × Light/Dark (4 combinations per page)

**Checkpoint**: Foundation ready — users can register, log in, log out, and reset passwords. i18n and theming infrastructure works. All shared types and utilities exist. User story implementation can now begin.

---

## Phase 3: User Story 1 — Admin Creates and Schedules an Exam (Priority: P1) 🎯 MVP

**Goal**: An Admin builds an exam with MCQ and essay questions, sets a schedule, and publishes it.

**Independent Test**: An Admin creates one exam with both question types and publishes it; it becomes visible as upcoming only to permitted students.

### Tests for User Story 1 🧪

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T028 [P] [US1] TDD test for exam CRUD service in `tests/unit/services/exam.test.ts` — test create, read, update, delete exam (admin-scoped)
- [ ] T029 [P] [US1] TDD test for question CRUD service in `tests/unit/services/question.test.ts` — test add/edit/delete MCQ (≥2 choices, 1 correct) and essay (≥1 reference answer) with validation (FR-002, FR-002a, FR-002b)
- [ ] T030 [P] [US1] TDD test for exam publishing logic in `tests/unit/services/exam-publish.test.ts` — test publish/unpublish transitions, immutability enforcement (FR-004a)
- [ ] T030a [P] [US1] TDD test proving privilege escalation is blocked: a user with profiles.role = 'student' MUST NOT be able to INSERT into exams, groups, group_students, exam_permissions, or questions under any circumstance, even when setting admin_id/owning fields to their own auth.uid(). Test each of these five tables explicitly. (this test MUST run against a real local Postgres/Supabase instance via Supabase CLI + Docker, not a mocked client — RLS policies cannot be validated by mocks)

### Implementation for User Story 1

- [ ] T031 [US1] Create exam service in `src/lib/services/exam-service.ts` — CRUD operations on `exams` table via Supabase client (admin-scoped via RLS)
- [ ] T032 [US1] Create question service in `src/lib/services/question-service.ts` — CRUD on `questions` table with validation: MCQ requires ≥2 choices + exactly 1 `correct_choice`; essay requires ≥1 reference answer; enforce `points` default (FR-002a); reject empty text (FR-002b)
- [ ] T033 [US1] Create Admin dashboard page at `src/app/admin/page.tsx` — lists Admin's own exams (draft/published) with status indicators
- [ ] T034 [US1] Create exam creation/edit page at `src/app/admin/exams/create/page.tsx` — form for title, description, start_time (datetime picker), duration_minutes
- [ ] T035 [US1] Create question editor component at `src/components/admin/QuestionEditor.tsx` — supports MCQ (dynamic choices with add/remove, correct marking) and essay (reference answers with add/remove)
- [ ] T036 [US1] Create exam publish action in `src/app/admin/exams/[examId]/publish/` — toggles `is_published`, shows confirmation dialog with student/group count
- [ ] T037 [US1] Implement XSS-safe text rendering utility in `src/lib/sanitize.ts` — sanitize all user-supplied text for display (FR-002c)
- [ ] T038 [P] [US1] Write Visual Regression Tests for exam creation UI in `tests/visual/admin-exam-create.spec.ts` — AR/EN × Light/Dark snapshots

**Checkpoint**: An Admin can create exams with mixed question types and publish them. Immutability is enforced by existing DB triggers.

---

## Phase 4: User Story 2 — Admin Manages Student Groups and Exam Access (Priority: P1)

**Goal**: An Admin organizes students into groups and grants exam access to individuals, groups, or both.

**Independent Test**: An Admin creates a group, adds students, assigns the group to an exam, and only those students see the exam.

### Tests for User Story 2 🧪

- [ ] T039 [P] [US2] TDD test for group CRUD service in `tests/unit/services/group.test.ts` — test create, list, add/remove students (admin-scoped, FR-005a)
- [ ] T040 [P] [US2] TDD test for exam permissions service in `tests/unit/services/exam-permissions.test.ts` — test grant to individual, grant to group, mixed grant, ownership cross-check (FR-005a)

### Implementation for User Story 2

- [ ] T041 [US2] Create group service in `src/lib/services/group-service.ts` — CRUD on `groups` and `group_students` tables (admin-scoped via RLS)
- [ ] T042 [US2] Create exam permissions service in `src/lib/services/exam-permissions-service.ts` — manage `exam_permissions` rows, supports individual + group grants
- [ ] T043 [US2] Create groups management page at `src/app/admin/groups/page.tsx` — list groups, create new, view members
- [ ] T044 [US2] Create group detail page at `src/app/admin/groups/[groupId]/page.tsx` — add/remove students by email lookup
- [ ] T045 [US2] Create exam access/permissions UI component at `src/components/admin/ExamPermissions.tsx` — student search + group selector (only own groups per FR-005a) used in exam creation/publish flow
- [ ] T046 [P] [US2] Write Visual Regression Tests for groups UI in `tests/visual/admin-groups.spec.ts` — AR/EN × Light/Dark snapshots

**Checkpoint**: An Admin can manage groups and grant exam access. Combined with US1, a full exam setup workflow works.

---

## Phase 5: User Story 3 — Student Takes and Submits a Timed Exam (Priority: P1) 🎯 MVP

**Goal**: A permitted Student opens their exam, answers MCQ/essay questions with autosave, handles offline gracefully, and submits.

**Independent Test**: A test student takes a mixed MCQ/essay exam end-to-end, including a simulated dropped connection, and the attempt closes correctly with all confirmed answers intact.

### Tests for User Story 3 🧪

> **NOTE:** These Edge Function tests MUST run against a real local Postgres/Supabase instance (via Supabase CLI + Docker) rather than a mocked Supabase client. RLS policies, triggers, enum casts, and search_path behavior cannot be validated by mocks — as demonstrated during live debugging.

- [ ] T047 [P] [US3] TDD test for `start-attempt` Edge Function in `tests/unit/edge-functions/start-attempt.test.ts` — test all 7 validation steps per contract, success with session creation, session takeover (FR-021a), idempotency
- [ ] T048 [P] [US3] TDD test for `get-exam-questions` Edge Function in `tests/unit/edge-functions/get-exam-questions.test.ts` — test validation steps, verify response NEVER contains `correct_choice` or `reference_answers` (Principle II)
- [ ] T049 [P] [US3] TDD test for `save-answer` Edge Function in `tests/unit/edge-functions/save-answer.test.ts` — test validation steps, time re-validation (FR-016), UPSERT idempotency, session check
- [ ] T050 [P] [US3] TDD test for `submit-attempt` Edge Function in `tests/unit/edge-functions/submit-attempt.test.ts` — test validation, `in_progress` → `submitted`, idempotency for already-submitted, rejection for `auto_submitted`/`abandoned`/`voided`

### Implementation for User Story 3 — Edge Functions

- [ ] T051 [US3] Create shared Edge Function utilities in `supabase/functions/_shared/` — Supabase service-role client init, error response helper (per error-policy.md), denial logging (per DenialLog interface), UUID validation
- [ ] T052 [US3] Implement `start-attempt` Edge Function in `supabase/functions/start-attempt/index.ts` — per start-attempt.md contract: validate token + auth.uid binding, time window check, atomic SELECT FOR UPDATE + UPDATE, session takeover with logging, return `remaining_seconds` + `exam_ends_at`
- [ ] T053 [US3] Implement `get-exam-questions` Edge Function in `supabase/functions/get-exam-questions/index.ts` — per get-exam-questions.md contract: validate attempt ownership + session + status + time window, return safe columns only (`id, type, text, points, order, mcq_choices` with filtered `{id, text}` only)
- [ ] T054 [US3] Implement `save-answer` Edge Function in `supabase/functions/save-answer/index.ts` — per save-answer.md contract: validate all checks including per-request time re-validation (FR-016), UPSERT answer row, return `saved_at` timestamp
- [ ] T055 [US3] Implement `submit-attempt` Edge Function in `supabase/functions/submit-attempt/index.ts` — per submit-attempt.md contract: validate ownership + session, transition `in_progress` → `submitted`, set `finished_at`, handle idempotent re-submit

### Implementation for User Story 3 — Frontend

- [ ] T056 [US3] Create student dashboard page at `src/app/student/page.tsx` — list upcoming exams (published + permitted), past attempts with status
- [ ] T057 [US3] Create exam-taking page at `src/app/student/exam/[attemptId]/page.tsx` — calls `start-attempt`, displays countdown timer (informational per Principle I), renders questions from `get-exam-questions`
- [ ] T058 [US3] Create MCQ answer component at `src/components/exam/McqQuestion.tsx` — radio selection triggers debounced `save-answer` call (on selection change)
- [ ] T059 [US3] Create essay answer component at `src/components/exam/EssayQuestion.tsx` — textarea with debounced `save-answer` call (after typing pause / on blur, per FR-014)
- [ ] T060 [US3] Create save-status indicator component at `src/components/exam/SaveStatus.tsx` — shows per-question status: "Saving...", "Saved ✓", "Unsynced ⚠️" (FR-015)
- [ ] T061 [US3] Implement offline queue in `src/lib/offline-queue.ts` — queue failed save-answer calls locally, show unsynced state, retry on reconnect, reject server-side if window closed (FR-016)
- [ ] T062 [US3] Create submit exam button/modal at `src/components/exam/SubmitExam.tsx` — confirmation dialog, calls `submit-attempt`, shows success/already-submitted state
- [ ] T063 [US3] Implement countdown timer component at `src/components/exam/CountdownTimer.tsx` — displays remaining time from `remaining_seconds` (informational), visual warning at low time
- [ ] T064 [US3] Implement session takeover handling in exam-taking page — if `was_takeover: true` from `start-attempt`, show notification to student; handle stale-session 403 errors gracefully
- [ ] T065 [P] [US3] Write Visual Regression Tests for exam-taking UI in `tests/visual/student-exam.spec.ts` — AR/EN × Light/Dark snapshots for question display, timer, save indicators

**Checkpoint**: A student can take a complete exam end-to-end with autosave, offline handling, and manual submission. Combined with US1+US2, the full exam lifecycle works.

---

## Phase 6: User Story 4 — Exam Attempt Closes Automatically When Time Expires (Priority: P1)

**Goal**: Every attempt that reaches its scheduled end time is closed by the system itself, without depending on the Student's browser.

**Independent Test**: Start an attempt, close the browser before time expires, wait past the exam's end time, and confirm `auto_submitted` without any client action.

### Tests for User Story 4 🧪

> **NOTE:** Like US3, these tests MUST run against a real local Postgres/Supabase instance (via Supabase CLI + Docker) rather than mocked.

- [ ] T066 [P] [US4] TDD test for expired-attempt sweep function in `tests/unit/db/sweep-expired-attempts.test.ts` — test `in_progress` → `auto_submitted` and `pending` → `abandoned` transitions by programmatically creating a test attempt, advancing/simulating time past the deadline (or directly invoking fn_sweep_expired_attempts()), and verifying the status transition and `finished_at` value.
- [ ] T067 [P] [US4] TDD test verifying re-access denial after `auto_submitted` in `tests/unit/edge-functions/post-expiry-denial.test.ts` — `start-attempt` returns 403 for `auto_submitted`/`abandoned` attempts

### Implementation for User Story 4

- [ ] T069 [US4] Implement client-side timer expiry handling in exam-taking page — when countdown reaches 0, show "Time's up" message, disable all inputs, redirect to results/dashboard after brief delay
- [ ] T070 [US4] Implement student-side UI for `abandoned` vs `auto_submitted` distinction in `src/app/student/page.tsx` — past attempts list shows correct status label and icon

**Checkpoint**: Attempts auto-close server-side regardless of client connectivity. The full attempt lifecycle (`pending` → `in_progress` → `submitted`/`auto_submitted`/`abandoned`) is fully functional.

---

## Phase 7: User Story 5 — Student Views Their Own Result (Priority: P2)

**Goal**: Once graded, a Student sees their total score and per-question breakdown.

**Independent Test**: After an attempt is graded (mock grading by setting `score` directly), the student sees the correct total and breakdown.

### Tests for User Story 5 🧪

- [ ] T071 [P] [US5] TDD test for results service in `tests/unit/services/results.test.ts` — test score computation, per-question breakdown, pending-grading state detection
- [ ] T072 [P] [US5] TDD test for RLS on answers/attempts in `tests/unit/db/results-rls.test.ts` — verify student can only see own attempt scores, never another student's

### Implementation for User Story 5

- [ ] T073 [US5] Create results service in `src/lib/services/results-service.ts` — fetches attempt with answers and scores, computes total, detects pending-grading state
- [ ] T074 [US5] Create results page at `src/app/student/results/[attemptId]/page.tsx` — displays total score, per-question breakdown (MCQ: selected vs correct after grading; essay: score), or "Grading in progress" pending state (FR-022)
- [ ] T075 [US5] Create result summary card component at `src/components/results/ResultCard.tsx` — shows attempt status, score, date, exam title
- [ ] T076 [P] [US5] Write Visual Regression Tests for results page in `tests/visual/student-results.spec.ts` — AR/EN × Light/Dark, both graded and pending states

**Checkpoint**: Students can view their own results with full per-question breakdown.

---

## Phase 8: User Story 6 — Platform Works Fully in Arabic or English, Light or Dark (Priority: P1)

**Goal**: Every screen works correctly in both languages (RTL/LTR) and both themes.

**Independent Test**: Exercise every screen from US1–US5 in both languages and both themes; layout, text, and legibility must be correct in every combination.

### Tests for User Story 6 🧪

- [ ] T077 [P] [US6] TDD test for language/theme persistence in `tests/unit/services/preferences.test.ts` — test saving preference to profile, loading on login, cross-device persistence (FR-026)

### Implementation for User Story 6

- [ ] T078 [US6] Create preferences service in `src/lib/services/preferences-service.ts` — read/update `preferred_language` and `preferred_theme` on `profiles` table
- [ ] T079 [US6] Create language/theme switcher component at `src/components/shared/PreferenceSwitcher.tsx` — dropdown or toggle for language (AR/EN) and theme (Light/Dark), calls preferences service, updates providers
- [ ] T080 [US6] Complete Arabic translations in `src/locales/ar.json` — all UI strings from US1–US5 screens
- [ ] T081 [US6] Complete English translations in `src/locales/en.json` — all UI strings from US1–US5 screens
- [ ] T082 [US6] Audit all components for RTL correctness — verify mirrored alignment, spacing, direction-sensitive icons (Constitution IX)
- [ ] T083 [US6] Audit all components for dark mode correctness — verify no hardcoded colors, proper contrast in dark theme (Constitution IX)
- [ ] T084 [P] [US6] Write comprehensive Visual Regression Tests in `tests/visual/bilingual-theme.spec.ts` — full-app sweep: every screen × 4 combinations (AR-Light, AR-Dark, EN-Light, EN-Dark)

**Checkpoint**: Every screen renders correctly in all 4 language/theme combinations with no missing translations or broken layouts.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [ ] T085 [P] Create README.md with project setup instructions, architecture overview, dev workflow, and document the manual first-admin-promotion step (UPDATE profiles SET role = 'admin' via SQL Editor, since the role-change trigger blocks it any other way) as a required one-time setup step for anyone deploying this project.
- [ ] T086 Code cleanup and refactoring — remove dead code, ensure consistent naming conventions, check for TODO comments
- [ ] T087 [P] Security audit: verify no service-role key in frontend code, verify all Edge Functions use uniform error responses (error-policy.md), verify `correct_choice`/`reference_answers` never leak
- [ ] T088 [P] Performance review: check React Query cache settings, verify debounce timing for autosave, ensure no unnecessary re-renders during exam-taking
- [ ] T089 [P] Run quickstart.md validation scenarios end-to-end (all 4 scenarios from quickstart.md)
- [ ] T090 [P] Accessibility audit: keyboard navigation, ARIA labels, screen reader compatibility for exam-taking flow

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 — Admin exam creation
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1
- **US3 (Phase 5)**: Depends on Phase 2 + US1 (needs exams to exist) + US2 (needs permissions to exist) — **core exam-taking**
- **US4 (Phase 6)**: Depends on US3 (needs active attempts to test sweep) — **auto-close**
- **US5 (Phase 7)**: Depends on US3 (needs submitted attempts) — **results view**
- **US6 (Phase 8)**: Depends on US1–US5 (audits all screens) — **bilingual/theme polish**
- **Polish (Phase 9)**: Depends on all phases complete

### User Story Dependencies

```
Phase 1 (Setup)
    └─► Phase 2 (Foundational) ──BLOCKS──┐
                                          ├──► US1 (Admin Exam Create) ──┐
                                          │                              ├──► US3 (Student Takes Exam) ──┬──► US4 (Auto-Close)
                                          ├──► US2 (Groups & Access) ────┘                               └──► US5 (Results View)
                                          │                                                                         │
                                          └──────────────────────────────────────────────────────────── US6 (i18n/Theme Audit) ◄──┘
                                                                                                               │
                                                                                                          Phase 9 (Polish)
```

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Principle VIII)
- Services before pages/components
- Edge Functions before frontend consumers
- Core implementation before integration
- Story checkpoint validation before moving to next priority

### Parallel Opportunities

- **Phase 1**: T003, T004, T005, T006 can all run in parallel
- **Phase 2**: T017/T018 in parallel; T023/T024/T025 in parallel; T027 in parallel
- **US1 + US2**: Can run in parallel (both depend only on Phase 2)
- **US4 + US5**: Can run in parallel (both depend on US3)
- **Within each story**: All test tasks marked [P] can run in parallel; all VRT tasks marked [P] can run in parallel

---

## Parallel Example: User Story 3

```bash
# Launch all Edge Function tests together (write FIRST, ensure FAIL):
Task: T047 "TDD test for start-attempt"
Task: T048 "TDD test for get-exam-questions"
Task: T049 "TDD test for save-answer"
Task: T050 "TDD test for submit-attempt"

# Then implement Edge Functions (can partially parallel — shared utils first):
Task: T051 "Shared Edge Function utilities" (FIRST — others depend on it)
Task: T052-T055 "Individual Edge Functions" (after T051, can be parallel)

# Then build frontend components (can partially parallel):
Task: T058 + T059 "MCQ and Essay components" (parallel — different files)
Task: T060 + T063 "Save status + Timer" (parallel — different files)
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 — Admin creates and publishes exam
4. Complete Phase 4: US2 — Admin sets up groups and access
5. Complete Phase 5: US3 — Student takes exam end-to-end
6. **STOP and VALIDATE**: Run quickstart.md scenarios 1–3
7. Deploy/demo if ready — this is the MVP! 🎯

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 + US2 → Admin can fully set up exams → Demo
3. Add US3 → Full exam lifecycle works → **MVP Deploy** 🚀
4. Add US4 → Auto-close guarantees → Deploy
5. Add US5 → Student results view → Deploy
6. Add US6 → Full bilingual/theme audit → Deploy
7. Polish → Production-ready

### Solo Developer Strategy

Since this is a solo project:

1. Complete Setup + Foundational sequentially
2. US1 → US2 → US3 (priority order, sequential)
3. US4 → US5 (sequential after US3)
4. US6 as final audit pass
5. Polish

---

## Notes

- [P] tasks = different files, no dependencies — can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable at its checkpoint
- Verify tests fail before implementing (Constitution Principle VIII — RED → GREEN → REFACTOR)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Database migration files exist but MUST be reconciled and verified via T007a before any other work begins — do not assume they are correct as-is.
- Edge Functions are the primary backend work in this feature
- Constitution compliance is checked at every phase via tests and audit tasks
