# Data Model: 001-foundation

## Entities & Relationships

### 1. `users` (managed by Supabase Auth)
- Authenticated identities. Extended via a `profiles` table.

### 2. `profiles`
- `id`: uuid (PK, references auth.users)
- `role`: enum ('student', 'admin')
- `full_name`: text
- `preferred_language`: text ('en', 'ar')
- `preferred_theme`: text ('light', 'dark')

**RLS — All authenticated roles (CRITICAL):**
- **SELECT** own profile only (`id = auth.uid()`).
- **UPDATE** own profile only (`id = auth.uid()`), restricted to columns `full_name`, `preferred_language`, `preferred_theme`. The `role` column MUST NOT be updatable by the user themselves — enforced via column-level privileges or a BEFORE UPDATE trigger that rejects any change to `role` unless performed by a service-role/trusted context. A student must never be able to set their own role to `'admin'` via a direct API call — this is the same "server enforces the rule, not just the UI" principle as the write-lockdown applied elsewhere.
- **NO INSERT or DELETE** policy for any user role. Profile creation is handled by a database trigger on `auth.users` insert (or a service-role Edge Function during signup).

**RLS — Admin role (additional SELECT):**
- Admin may SELECT profiles of students within their own scope — scoped via join through owned groups/exam_attempts: `id IN (SELECT student_id FROM group_students WHERE group_id IN (SELECT id FROM groups WHERE admin_id = auth.uid())) OR id IN (SELECT student_id FROM exam_attempts WHERE exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()))`. This supports displaying student names in `004-admin-insights` monitoring/results views without granting open access to all profiles.

### 3. `groups`
- `id`: uuid (PK)
- `name`: text
- `admin_id`: uuid (FK to profiles, restricts ownership - FR-005a)

**RLS — Admin role:**
- **SELECT/INSERT/UPDATE/DELETE** only where `admin_id = auth.uid()`. An Admin must never be able to read or modify another Admin's groups via the API.

### 4. `group_students`
- `group_id`: uuid (FK to groups)
- `student_id`: uuid (FK to profiles)
- (PK is `group_id`, `student_id`)

**RLS — Admin role:**
- **SELECT/INSERT/UPDATE/DELETE** only where the parent group's `admin_id = auth.uid()` (via subquery: `group_id IN (SELECT id FROM groups WHERE admin_id = auth.uid())`). Ownership is inherited from the parent group.

### 5. `exams`
- `id`: uuid (PK)
- `title`: text
- `description`: text
- `start_time`: timestamptz (Scheduled start)
- `duration_minutes`: integer
- `admin_id`: uuid (FK to profiles, ownership restriction - FR-010c)
- `is_published`: boolean

**RLS — Admin role:**
- **SELECT/INSERT/UPDATE/DELETE** only where `admin_id = auth.uid()`. An Admin must never be able to read or write another Admin's exam row directly via the API.

**RLS — Student role (FR-008):**
- **SELECT** only, scoped to published exams the student is permitted to take: `is_published = true AND id IN (SELECT exam_id FROM exam_permissions WHERE student_id = auth.uid() OR group_id IN (SELECT group_id FROM group_students WHERE student_id = auth.uid()))`. A student can never see a draft/unpublished exam's title or schedule even if the Admin has already added their permission. Column list restricted to: `id`, `title`, `description`, `start_time`, `duration_minutes`, `is_published` — `admin_id` excluded.
- **NO INSERT, UPDATE, or DELETE** for the student role.

### 6. `exam_permissions`
- `exam_id`: uuid (FK to exams)
- `group_id`: uuid (FK to groups, nullable)
- `student_id`: uuid (FK to profiles, nullable)
- Either `group_id` or `student_id` must be set.
- **Constraint (FR-005a)**: RLS/Database function must enforce that if `group_id` is set, the group belongs to the exact same `admin_id` as the `exam_id`.

**RLS — Admin role:**
- **SELECT/INSERT/UPDATE/DELETE** only where the parent exam's `admin_id = auth.uid()` (via subquery: `exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid())`). This ensures the requesting Admin owns the exam itself — the existing FR-005a constraint on `group_id` is an additional cross-ownership check, not a substitute for this one.

**RLS — Student role:**
- **SELECT** only, scoped to rows where the parent exam is published (`exam_id IN (SELECT id FROM exams WHERE is_published = true)`) AND the student is the direct target (`student_id = auth.uid()`) or is a member of the referenced group (`group_id IN (SELECT group_id FROM group_students WHERE student_id = auth.uid())`). This lets the frontend query "am I permitted for this exam" while preventing visibility into draft/unpublished exam permissions.
- **NO INSERT, UPDATE, or DELETE** for the student role.

### 7. `questions`
- `id`: uuid (PK)
- `exam_id`: uuid (FK to exams)
- `type`: enum ('mcq', 'essay')
- `text`: text
- `points`: numeric (default 1.0)
- `order`: integer
- `mcq_choices`: jsonb (array of objects with stable IDs: e.g., `[{id: "a", text: "..."}]`)
- `correct_choice`: text (stores the stable `id` of the choice, HIDDEN from students)
- `reference_answers`: jsonb (array of objects with stable IDs: e.g., `[{id: "ref1", text: "..."}]`, HIDDEN from students)

**RLS — Admin role:**
- **SELECT/INSERT/UPDATE/DELETE** only where the parent exam's `admin_id = auth.uid()` (via subquery: `exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid())`). A question's ownership is inherited from its exam.

**Student access — NO direct RLS policy. Served exclusively via `get-exam-questions` Edge Function:**
- Students have **no RLS SELECT policy** on this table. All question access is routed through a dedicated `get-exam-questions` Edge Function (service-role), which:
  1. Validates `auth.uid()` + `access_token` binding (same check as the attempt-start function).
  2. Returns questions **only** if the student's `exam_attempts` row is currently `in_progress` AND `now()` is within `[exam.start_time, exam.start_time + exam.duration_minutes)`.
  3. Returns only safe columns: `id`, `type`, `text`, `points`, `order`, `mcq_choices` (with choice `id` + `text`) — never `correct_choice` or `reference_answers`.
- This closes two gaps: (a) a permitted student cannot read question text/choices before the exam starts by querying the table directly; (b) it removes reliance on getting Postgres column-level GRANTs exactly right as the schema evolves, replacing it with one auditable function.

### 8. `exam_attempts`
- `id`: uuid (PK)
- `exam_id`: uuid (FK to exams)
- `student_id`: uuid (FK to profiles)
- `access_token`: text (unique, not null, cryptographically random e.g., UUID v4 — FR-009)
- `status`: enum ('pending', 'in_progress', 'submitted', 'auto_submitted', 'abandoned', 'voided')
- `started_at`: timestamptz
- `finished_at`: timestamptz
- `session_id`: uuid (To enforce single active session — FR-021a)

**RLS — Student role (CRITICAL):**
- **SELECT** only, scoped to `student_id = auth.uid()`. Column list explicitly **excludes `access_token`** — the token is delivered once via the emailed link and validated only server-side by Edge Functions; it must never be returned by a client-facing read query.
- **NO INSERT, UPDATE, or DELETE** policy is granted to the student role. Every write to this table (creating pending attempts, transitioning status, updating `session_id`) happens exclusively through Edge Functions running with **service-role privileges** (which bypass RLS by design).

### 9. `answers`
- `id`: uuid (PK)
- `attempt_id`: uuid (FK to exam_attempts)
- `question_id`: uuid (FK to questions)
- `mcq_answer`: text (nullable)
- `essay_answer`: text (nullable)
- `score`: numeric (nullable, [0, 1] set by 002-automated-grading)

**RLS — Student role (CRITICAL):**
- **SELECT** only, scoped to answers belonging to the student's own attempts (`attempt_id IN (SELECT id FROM exam_attempts WHERE student_id = auth.uid())`).
- **NO INSERT, UPDATE, or DELETE** policy is granted to the student role. All answer-saving happens through the **answer-save Edge Function** using service-role privileges. This prevents a student from bypassing time validation, session checks, or token binding by writing directly to the table via the Supabase client SDK.

## State Transitions & Validation
- **Immutability (FR-004a)**: RLS or database triggers will block updates to `exams` and `questions` if `EXISTS (SELECT 1 FROM exam_attempts WHERE exam_id = exams.id AND status != 'pending')`.
- **Visibility (Principle II)**: Students have no direct RLS access to `questions`. All question access is served exclusively via the `get-exam-questions` Edge Function, which returns only safe columns (`id`, `type`, `text`, `points`, `order`, `mcq_choices`) and only during an active, in-progress attempt within the exam's time window. This eliminates the risk of column-level GRANT drift and prevents pre-exam question exposure.
- **Attempt Access (Principle III & FR-009a)**: The attempt-start Edge Function validates that `now() >= exam.start_time` and `now() < exam.start_time + exam.duration_minutes`. It MUST require BOTH a valid authenticated user (`auth.uid()`) and the `access_token` in the URL. If the token is valid but the authenticated user doesn't match the attempt's `student_id`, access is denied.
- **Answer-Save Time Re-validation (FR-016)**: The answer-save/submit Edge Function MUST independently re-check `now() < exam.start_time + exam.duration_minutes` on **every single save request** — not only at attempt start. An answer arriving after the deadline (e.g. from a reconnecting offline client) is rejected even if the attempt's status hasn't been swept to `auto_submitted` yet by the pg_cron job.
- **Pending Attempt Creation (FR-020a & FR-004b)**: A pg_cron job (using `pgcrypto` for token generation) runs at each exam's `start_time` to create a `pending` attempt (with generated `access_token`) for every permitted student. Additionally, if an Admin adds a student/group to an already-started exam, a database trigger on `exam_permissions` immediately creates the pending attempt.
- **Session Invalidation (FR-021a)**: When a new session opens an `in_progress` attempt, the Edge Function MUST overwrite `session_id` with the new session's ID. Answer saving/submitting Edge Functions MUST reject any requests carrying an old `session_id`.
- **Expired-Attempt Sweep (FR-018 & FR-020b)**: A single pg_cron job handles both expired-attempt transitions in one pass:
  1. `in_progress` → `auto_submitted`: finds every `exam_attempts` row where `status = 'in_progress'` AND `now() >= exam.start_time + exam.duration_minutes`, sets `status = 'auto_submitted'` and `finished_at = now()`.
  2. `pending` → `abandoned`: finds every `exam_attempts` row where `status = 'pending'` AND `now() >= exam.start_time + exam.duration_minutes`, sets `status = 'abandoned'`. This covers students who never opened their exam link — without this clause, their attempt would remain stuck in `pending` indefinitely.
- **Write-Path Lockdown (Principle I)**: Students have **no direct write access** to `exam_attempts` or `answers` at the database level. All mutations flow through Edge Functions with service-role privileges. This ensures that server-side validation (time checks, token binding, session locking) cannot be bypassed via the client SDK.
- **Profiles Role Lockdown (Principle I & III)**: The `role` column on `profiles` is not updatable by any user-facing RLS policy. A student cannot escalate their own privileges to `'admin'` via a direct API call. Profile creation is handled exclusively by service-role/trusted context.
- **Admin Ownership Isolation (Principle I)**: The same "server enforces ownership, not just the UI" principle applied to the student write-lockdown and profiles role-lockdown above is extended consistently to every admin-owned resource. `profiles`, `exams`, `questions`, `groups`, `group_students`, and `exam_permissions` all enforce ownership at the RLS level (directly via `admin_id = auth.uid()`, via parent join, or via `id = auth.uid()`), so a direct API call can never read or modify another user's data.
