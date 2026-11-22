---
description: "Dependency-ordered implementation tasks for unified identity"
---

# Tasks: Unified Identity and Relationship-Based Access

**Input**: Design documents from `/specs/007-unified-identity/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Organization**: Phase 0 is a hard baseline gate. Subsequent phases follow migrations 0014–0022, with the unified UI phase after the 0017 database cutover and before the owner-column and final role drops. Every migration phase is test-first, runs the frozen allow/deny cases before and after, performs a catalog scan, and commits its reviewed result.

**Test discipline**: Tests are required by FR-014–017, Constitution III and VIII. Write behavior/security tests before implementation; record the current schema's existing behavior in Phase 0 even where a future-state assertion is expected to fail against the old schema.

**Working tree protection**: At task generation, the following files already have unrelated uncommitted changes: `src/app/dashboard/page.tsx`, `src/app/globals.css`, `src/app/workspace.css`, `src/components/shared/WorkspaceLayout.tsx`, and `src/components/ui/card.tsx`. The dashboard and shell are explicitly required by the UI phase and are flagged below; inspect and preserve their existing edits while integrating this feature. No task targets `globals.css`, `workspace.css`, or `card.tsx`; leave those edits untouched unless a separately added, explicitly flagged task becomes necessary.

## Phase 0: Security Baseline Gate — BLOCKS ALL MIGRATIONS AND UI WORK

**Purpose**: Build the harness first, freeze the migration-derived inventory, then run and commit the complete before suite against the current 0001–0013 role-based schema. Do not start T009 or any later implementation task until T008 is checked and the baseline commit hash is recorded.

- [X] T001 Build the local-Supabase security harness runner and structured per-case result output in `tests/security/007-unified-identity/harness.ts` and wire its command in `package.json`.
- [X] T002 Create the deterministic synthetic actor/resource fixture generator and versioned logical fixture manifest in `tests/security/007-unified-identity/fixtures.ts` and `tests/security/007-unified-identity/fixture-manifest.json`.
- [X] T003 Generate and freeze the migration-derived policy/function/trigger/Edge-path inventory from `supabase/migrations/0001_schema.sql` through `supabase/migrations/0013_list_my_joined_groups.sql` into `specs/007-unified-identity/security-baseline/inventory.json` and `specs/007-unified-identity/security-baseline/inventory.md`; reconcile every entry with the plan matrix and current local `pg_catalog`.
- [X] T004 [P] Write current-schema allow/deny API integration tests for every inventoried RLS policy, including direct `group_students` owner INSERT allow and non-owner denial, in `tests/security/007-unified-identity/rls-before.test.ts`.
- [X] T005 [P] Write current-schema allow/deny tests for every inventoried role-dependent function and trigger, including participant lookup/list, invitations, attempt operations, result visibility and absence of implemented void/override paths, using `supabase/tests/007-unified-identity/rpc-trigger-before.sql` and `tests/security/007-unified-identity/rpc-trigger-before.test.ts`.
- [X] T006 [P] Write current-schema authenticated/anon allow/deny integration cases for `start-attempt`, `get-exam-questions`, `save-answer`, and `submit-attempt` in `tests/security/007-unified-identity/edge-before.test.ts`.
- [X] T007 Run the complete before suite against the unmodified local 0001–0013 role-based schema; require at least one recorded allow and deny result per inventory item and save raw output plus expected legacy direct-insert behavior under `specs/007-unified-identity/security-baseline/before/`.
- [X] T008 Export fixture IDs/edges, case IDs, migration version, commit hash, UTC time, command, raw output and SHA-256 manifest; commit the complete `specs/007-unified-identity/security-baseline/before/` evidence before any reset/reseed or migration. Record that commit hash in `specs/007-unified-identity/security-baseline/before/README.md`.

**GATE**: T008 must be checked and its commit hash recorded before any task in Phase 0014 or later starts. If a matrix entry cannot be run, extend the harness/inventory and repeat Phase 0; do not proceed with a partial baseline.

---

## Phase 0014: Add and Enforce the Owner Mirror

**Purpose**: Add `owner_id` without changing the existing role-based authorization behavior.

- [X] T009 [US4] Write tests first for insert fill, one-column update mirroring, divergent dual-column rejection and attempted owner transfer on both groups and exams in `supabase/tests/007-unified-identity/owner-mirror-0014.sql` and `tests/security/007-unified-identity/owner-mirror-0014.test.ts`.
- [X] T010 [US4] Add `owner_id` columns, backfill from `admin_id`, constraints/indexes, and BEFORE INSERT OR UPDATE equality triggers for groups and exams in `supabase/migrations/0014_owner_id_bridge.sql`; fill a missing value, mirror a single changed value, and reject divergent values while existing RLS still binds `admin_id` to `auth.uid()`.
- [X] T011 [US4] Run the frozen allow/deny suite before and after migration 0014 and run `owner-mirror-0014.sql`; prove all existing decisions are unchanged and both columns stay equal in `tests/security/007-unified-identity/harness.ts`.
- [X] T012 [US4] Scan `supabase/migrations/0014_owner_id_bridge.sql` and the applied catalog for changed policies, functions, triggers, search paths, grants and ownership references; record the scan under `specs/007-unified-identity/security-baseline/0014/`.
- [X] T013 [US4] Commit `supabase/migrations/0014_owner_id_bridge.sql`, its failing-first tests and recorded before/after results together after the scan passes.

---

## Phase 0015: Additive Authorization Preparation

**Purpose**: Prepare unused replacement helpers while all old role policies and functions remain active.

- [X] T014 [US4] Write tests first proving migration 0015 leaves all frozen allow/deny decisions unchanged and no new helper is callable without its intended checks in `supabase/tests/007-unified-identity/preparation-0015.sql` and `tests/security/007-unified-identity/preparation-0015.test.ts`.
- [X] T015 [US4] Add only unused owner/membership helper definitions and their least-privilege grants in `supabase/migrations/0015_relationship_helpers.sql`; do not switch policies, remove permission rows, change membership writes, or disable role paths.
- [X] T016 [US4] Run the frozen before/after matrix against schema 0014 and schema 0015 and require identical decisions in `tests/security/007-unified-identity/harness.ts`.
- [X] T017 [US4] Scan the schema after migration 0015 for policy/function/trigger/grant/search_path changes and role/admin dependencies; record results in `specs/007-unified-identity/security-baseline/0015/`.
- [X] T018 [US4] Commit `supabase/migrations/0015_relationship_helpers.sql`, its tests and passing evidence together after the scan passes.

---

## Phase 0016: Additive Profile Projection Functions

**Purpose**: Add the two distinct profile functions without changing currently active policies or client call paths.

- [X] T019 [US2] Write separate tests first for FR-008 associated participant list and FR-009 exact associated email lookup, including field allowlists, ownership, association, equal missing/unassociated responses, explicit uniform-timing assertions, per-requester/context rate limits, immediate loss of visibility when a relationship is removed, and question payload assertions excluding `correct_choice` and `reference_answers`, in `tests/security/007-unified-identity/participant-list.test.ts` and `tests/security/007-unified-identity/associated-email-lookup.test.ts` plus the relevant attempt security suite.
- [X] T020 [US2] Add the not-routed-by-the-UI owner-scoped participant-list and associated-email lookup functions with fixed search paths, explicit columns and `auth.uid()` ownership/relationship checks in `supabase/migrations/0016_profile_projections.sql`; grant only intended authenticated execution and return name+email for the list versus id+name for lookup.
- [X] T021 [US2] Run the complete legacy matrix before and after migration 0016 and run both new contract suites against the candidate functions, including direct authenticated RPC calls that bypass the UI, in `tests/security/007-unified-identity/runner.ts`.
- [X] T022 [US2] Scan all SECURITY DEFINER functions, grants, search paths and active policy references after migration 0016; record the catalog report in `specs/007-unified-identity/security-baseline/0016/`.
- [X] T023 [US2] Commit `supabase/migrations/0016_profile_projections.sql`, the separate failing-first contract tests and passing before/after evidence together after the scan passes.

---

## Phase 0017: Atomic Relationship Authorization Cutover

**Purpose**: Replace membership/permission checks, invitation and attempt RPCs, Edge invocation, and related membership UI/service behavior in one cutover group. Do not split or separately deploy the database and matching service changes.

- [X] T024 [US4] Write after-state tests first for all replacement policies/RPCs/triggers, owner self-join/self-exam denial, cross-owner denial, direct `group_students` INSERT/UPDATE denial for owner/member/unrelated/anon, and invitation redemption as the sole membership creation allow path in `supabase/tests/007-unified-identity/cutover-0017.sql`. Include a self-promotion probe: an authenticated account that sets `profiles.role='admin'` on itself (or a trusted test fixture with that value if the legacy update guard blocks the write) must still be denied access to another owner's groups/exams, participant lookup, invitations, attempts, and results.
- [X] T025 [US4] Write SECURITY DEFINER audit assertions first for fixed `search_path`, `auth.uid()` and relationship checks on every user-callable function, trusted-only grants for internal trigger/cron helpers, zero callable old `p_student_id` overloads, and no RLS policy trusting client identity values in `supabase/tests/007-unified-identity/security-definer-0017.sql`.
- [X] T026 [US4] Write Edge integration tests first for caller-JWT forwarding and request-body identity spoofing across all four attempt endpoints in `tests/security/007-unified-identity/edge-cutover-0017.test.ts`.
- [X] T027 [US1] Replace the direct `group_students` upsert and email-based add flow with the existing group invitation redemption flow in `src/lib/services/group-service.ts` and `src/app/admin/groups/[groupId]/page.tsx`; retain owner-scoped participant listing and invitation management.
- [X] T028 [US4] Update `supabase/functions/_shared/http.ts`, `supabase/functions/start-attempt/index.ts`, `supabase/functions/get-exam-questions/index.ts`, `supabase/functions/save-answer/index.ts`, and `supabase/functions/submit-attempt/index.ts` to authenticate and forward the caller JWT to the new RPCs instead of passing `p_student_id` through a service-role call.
- [X] T029 [US4] Audit existing SECURITY DEFINER functions in migrations `0001_schema.sql` through `0016_profile_projections.sql` only: require fixed safe `search_path` values, schema-qualified references, and direct `auth.uid()` plus ownership/membership checks for every user-callable function; prove internal trigger/cron helpers cannot be called by anon/authenticated and identify unnecessary grants. Record the audit output as the list of functions that migration 0017 (T030) must fix. Complete this audit before T030; T032 remains the full post-0017 catalog audit.
- [X] T030 [US4] **Depends on T029.** In the single transaction `supabase/migrations/0017_unified_authorization_cutover.sql`, replace all role-dependent policies, membership/permission rules, profile access, invitation checks, attempt generation and result guards; remove direct student exam permissions; reject owner self-join/self-exam; remove client `group_students` INSERT/UPDATE grants/policies; revoke EXECUTE from PUBLIC/anon/authenticated/service_role and DROP all old `p_student_id` attempt RPC signatures; create only JWT-based attempt RPC signatures (`fn_start_attempt(uuid,uuid)`, `fn_get_exam_questions(uuid,uuid)`, `fn_save_attempt_answer(uuid,uuid,uuid,text,text)`, `fn_submit_attempt(uuid,uuid)`). Keep direct attempt reads as the selected path: grant authenticated SELECT only on `id, exam_id, student_id, status, started_at, finished_at, session_id` (never `access_token`) and add participant-own-attempt and exam-owner RLS policies; do not grant table-wide SELECT or grant these columns to anon.
- [X] T031 [US4] Run the frozen matrix against schema 0016 and the full after-state suite immediately after 0017, including direct membership table write denials and invitation allow; verify old RPC signatures are absent and only caller-JWT signatures are callable in `tests/security/007-unified-identity/harness.ts`. Test direct safe-column attempt SELECT allow for the participant's own attempt and its exam owner, deny for another participant and another owner, and confirm `access_token` is unreadable including through `select=*`. Repeat the T024 self-promotion probe and prove no access to another owner's resources, lookup, invitations, attempts, or results.
- [x] T032 [US4] Rerun the full SECURITY DEFINER/search_path/auth/grant catalog audit after T030, and enumerate every `INSERT INTO group_students` reference; confirm only `redeem_group_invitation` plus test fixture setup inserts membership; record the post-cutover report in `specs/007-unified-identity/security-baseline/0017/`.
- [ ] T033 [US1] Commit `supabase/migrations/0017_unified_authorization_cutover.sql`, its security tests, `supabase/functions/_shared/http.ts`, the four attempt Edge handlers, and group invitation service/UI changes as one cutover changeset after all tests and catalog scans pass. <!-- Existing cutover files are committed across the preserved local commit sequence; no squash per user choice. -->

**0017 atomicity rule**: T027–T033 are one coupled release group. The database migration cannot be applied/deployed without its matching service and Edge changes; do not leave the UI calling direct membership writes or old RPC signatures.

## Pre-0017-apply follow-ups

**Purpose**: Finish the application/test changes and close the T031 coverage gaps before migration 0017 is applied. These tasks extend the coupled T027–T033 release group; they do not authorize a partial cutover.

- [X] T053 [US4] Update `tests/unit/edge-functions/attempt-test-context.ts` to create and clean up group membership plus group-only exam permission for the attempt participant; completed in commit `30de1da`.
- [X] T054 [US4] Update `tests/unit/db/student-attempt-operations.test.ts` to call the JWT-signature attempt RPCs through the participant client and cover anon, unrelated-user, and exam-owner denials.
- [X] T055 [US4] Update `tests/unit/db/sweep-expired-attempts.test.ts` for the post-0017 contract; invoke the cron database operation through a PostgreSQL connection, not `service_role`.
- [x] T056 [US1] Update `tests/unit/services/exam-permissions.test.ts` for group-only permission list, grant, revoke, and picker behavior.
- [x] T057 [US1] Update `tests/unit/services/group.test.ts` for invitation-only membership creation and the current group service contract.
- [x] T058 [US4] Update `tests/unit/services/privilege-escalation.test.ts` and `tests/unit/services/exam-publish.test.ts` for relationship-based authorization and role-independent publish access.
- [X] T059 [US4] Update the visual fixtures in `tests/visual/student-exam-submit.spec.ts` and `tests/visual/student-exam-offline.spec.ts` to establish the required group membership and group permission relationships.
- [X] T060 [US1] Confirm invitation redemption tests contain no obsolete add-by-email labels/assertions; the suite already verifies invitation-only membership creation.
- [X] T061 [US1] Rebaseline the affected `tests/visual/admin-groups.spec.ts` snapshots after the email-add flow is removed; all 12 locale/theme cases passed across Chromium, Firefox, and WebKit after increasing the screenshot font-load timeout.
- [X] T062 [US4] Add a regression test proving signup still succeeds (the auth.users trigger still creates the profile) after EXECUTE is revoked from `public.fn_create_profile_on_signup()`.
- [X] T063 [US4] Test authenticated and anon denial of `exam_attempts.access_token` and `select=*`, while preserving the exam owner's safe-column read; cover participant/owner and unrelated callers. Anon/authenticated denial must assert permission-denied (SQLSTATE 42501), not just any error; T066 must include an explicit owner self-exam denial case.
- [X] T064 [US4] Add a cron success assertion using `cron.job_run_details` after the authorization cutover.
- [X] T065 [US4] Test INSERT-only `ON CONFLICT DO NOTHING` upsert behavior for the owner on `exam_permissions(exam_id, group_id)` without UPDATE privilege.
- [X] T066 [US4] Expand the self-promotion probe to the full role, resource, lookup, invitation, attempt, and result denial matrix.
- [X] T067 [US1] Test invitation redemption by a user who owns an exam in a different context.
- [X] T068 [US4] Remove the dead `serviceClient()` export from `supabase/functions/_shared/http.ts` after confirming no remaining consumers.
- [X] T069 [US1] Remove orphan exam-permissions and `admin.groups` add/search i18n keys from `src/locales/en.json` and `src/locales/ar.json` after checking all consumers.
- [x] T070 [US1] Before migration 0021, update group/exam creation services to send `owner_id` instead of `admin_id`, and migrate related reads, `types.ts`, and attempt test fixtures; coordinate with T039/T043. (`src/lib/services/group-service.ts`, `src/lib/services/exam-service.ts`, `src/lib/types.ts:24,38`)

**Known limitations to carry forward**: Changes to `groups.owner_id` and `exams.owner_id` are not guarded by triggers, which is a future risk for courses. The final cron assertion reads `cron.job`, so applying 0017 requires `pg_cron`. The ExamPermissions picker has a UX gap when no ungranted groups remain.

**Apply gate**: Do not apply 0017 until T027/T028 code, all required updated tests, and all six T031 gap tests (T062–T067) exist. Apply only after a database backup and explicit user approval.

---

## Phase 0018: Owner INSERT ... RETURNING Visibility Fix

**Finding**: The after-0017 matrix showed owner INSERT requests for groups and exams failing when PostgREST requested returned rows. The owner SELECT policies called `private.owns_group(id)` and `private.owns_exam(id)`, which look up the row being returned.

- [X] T071 [US4] Add transaction-scoped regression probes for owner INSERT ... RETURNING on groups and exams using `admin_id` only, `owner_id` only, and equal owner fields; retain non-owner read, cross-owner denial, and anon denial cases in `supabase/tests/007-unified-identity/owner-returning-0018.sql` and register the probe in both security SQL runners.
- [X] T072 [US4] Add `supabase/migrations/0018_fix_owner_returning_visibility.sql` to add the direct `owner_id = auth.uid()` predicate to the groups/exams owner SELECT policies while retaining their existing ownership predicates; assert unchanged other policies and ACLs. Run probes and the legacy after-0017 matrix before proceeding.

## Phase UI: Unified Dashboard and Routes — AFTER 0018, BEFORE 0021

**Purpose**: Consolidate the signed-in experience after relationship-based database authorization is live, and remove every frontend role dependency before dropping `profiles.role`.

- [x] T034 [US3] Write functional and visual tests first for one account with owned and joined resources, empty/error states, authorized destinations, legacy `/admin`/`/student` redirects, question payloads omitting `correct_choice` and `reference_answers`, and immediate loss of profile visibility when a relationship is removed, in `tests/unit/services/dashboard.test.ts`, `tests/unit/lib/auth-guard.test.ts`, and `tests/visual/unified-dashboard.spec.ts` plus the relevant security suites.
- [x] T035 [US3] Implement the unified Learning/Teaching dashboard in `src/app/dashboard/page.tsx`, including the localized notice “course items will appear once 008-courses exists”; first inspect and preserve the existing uncommitted edits (**FLAGGED: this file is already modified in the working tree; preserve unrelated hunks**).
- [x] T036 [US3] Remove role-based shell props/navigation and implement ownership/membership-aware unified navigation in `src/components/shared/WorkspaceLayout.tsx` and `src/components/shared/SiteNavigation.tsx` (**FLAGGED: `WorkspaceLayout.tsx` already has uncommitted changes; preserve unrelated hunks**).
- [x] T037 [US3] Consolidate `/admin` and `/student` section roots into `/dashboard` and add relationship-authorized redirects for legacy routes in `src/proxy.ts`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, and `src/app/student/page.tsx`; preserve resource deep links only when the caller still has the appropriate ownership or membership relationship.
- [x] T038 [US1] Remove fixed-role guards from learner and owner resource pages while retaining resource-level authorization in `src/app/admin/groups/[groupId]/page.tsx`, `src/app/admin/exams/[examId]/edit/page.tsx`, `src/app/admin/exams/[examId]/publish/page.tsx`, `src/app/student/join-group/page.tsx`, `src/app/student/exam/[attemptId]/page.tsx`, and `src/app/student/results/[attemptId]/page.tsx`.
- [ ] T039 [US3] Replace role-based dashboard aggregation and identity types with relationship-based Learning/Teaching data in `src/lib/services/dashboard-service.ts` and `src/lib/types.ts`; update owner-field reads/writes to `owner_id` in `src/lib/services/group-service.ts` and `src/lib/services/exam-service.ts` before migration 0021; do not add authorization state to the client.
- [x] T040 [US3] Add and verify matching English and Arabic labels, empty/error/loading states, redirects and accessibility names in `src/locales/en.json` and `src/locales/ar.json`.
- [ ] T041 [US3] Run dashboard functional tests and visual review at desktop/mobile widths including 320 CSS pixels, with no horizontal scrolling or clipped controls, in English/LTR and Arabic/RTL, light and dark themes; record screenshots/results without editing `src/app/globals.css`, `src/app/workspace.css`, or `src/components/ui/card.tsx` unless a separate explicitly flagged task is added.
- [x] T078 [US3] Add a separately scoped dashboard-shell visual change: use the Manjam logo assets, align dashboard hero and focus states with shared semantic theme tokens in `src/app/globals.css` and `src/app/workspace.css`, and preserve light/dark behavior and RTL layout.

**UI/CSS edit flags**: T035 and T036 explicitly require touching the already-modified dashboard and shell files; preserve existing uncommitted changes. No task in this feature phase or the owner/role migration phases may edit `src/app/globals.css`, `src/app/workspace.css`, or `src/components/ui/card.tsx`; preserve their existing changes. If visual verification proves a CSS change is necessary, add a separately scoped task and obtain explicit approval before editing those files.

---

## Phase 0019: Fix Context-Scoped Lookup Timing

**Purpose**: Bound exact-email candidate matching to identities already associated with the caller-owned group or exam, preventing lookup cost from scaling with all `auth.users`.

- [x] T076 [US2] Fix the uniform-timing enumeration side channel before migration 0019. Add transaction-scoped lookup contract probes and register them in both SQL runners; add `supabase/migrations/0019_fix_lookup_timing.sql` with an atomic context-scoped function replacement, unchanged execution grants/security properties and catalog assertions; extract the uniform-timing case, add the after-0017 `--only uniform-timing` selector, and add an add-only ~500-member group timing case. Retain all existing assertions and the 5 ms limit. Gate committing the timing result on migration 0019 being applied and the focused timing and contract cases passing.

## Phase 0020: Local Profile Role Update Guard

**Purpose**: Prevent ordinary authenticated and anonymous callers from changing profile identity/role columns while preserving the profile fields the app is allowed to update. This guard migration is local-only and remains numbered 0020.

- [x] T077 [US4] Add and verify `supabase/migrations/0020_profiles_role_update_guard.sql`: inspect app profile updates; revoke table- and column-level UPDATE on `profiles` from `anon` and `authenticated`, then grant `authenticated` UPDATE only on `full_name`, `preferred_language`, and `preferred_theme`; verify `id` and `role` are not updatable by either role. Repair `fn_protect_profile_role()` to check the request role with `current_setting('role', true)` under SECURITY DEFINER, keep a safe search path, and allow trusted service_role/postgres operations. Write attack/regression tests first for self role changes, id changes, cross-user changes, anon updates, safe-column updates, and signup profile creation. Confirm no dependency on migrations 0014–0019; apply only to local Supabase, never a published database.

## Phase 0021: Drop the Legacy Owner Column

**Purpose**: Remove `admin_id` only after the app and all database authorization use `owner_id`.

- [x] T042 [US4] Write migration tests first proving all group/exam owner policies and services use `owner_id` and old/new authorization decisions still match; update `tests/visual/student-exam-submit.spec.ts` and `tests/visual/student-exam-offline.spec.ts` fixtures to use owner_id and group membership/permission relationships, with no `admin_id` writes, in `supabase/tests/007-unified-identity/drop-admin-id-0021.sql`.
- [x] T043 [US4] Drop the equality triggers and `admin_id` columns from groups and exams in `supabase/migrations/0021_drop_admin_id.sql`; retain `owner_id` as the sole owner field and use reset/replay for local rollback.
- [x] T044 [US4] Run the frozen matrix before and after 0021, run the affected unit and visual tests, and assert the owner mirror has no remaining source column in `tests/security/007-unified-identity/harness.ts`.
- [x] T045 [US4] Scan database definitions, application source/types, and visual-test fixtures for `admin_id`; record zero active database, app, or fixture references in `specs/007-unified-identity/security-baseline/0021/`.
- [x] T046 [US4] Commit `supabase/migrations/0021_drop_admin_id.sql`, its unit/visual tests and passing evidence together after the catalog/source scan passes.

---

## Phase 0022: Drop Fixed Roles — FINAL DATABASE MIGRATION

**Purpose**: Drop role data and helpers only after all replacement checks, services and UI are active and the full after-suite passes.

- [x] T047 [US4] Write final catalog and access tests first proving no active policy/function/trigger/Edge/UI path depends on role values and all owner/membership decisions still pass after role removal in `supabase/tests/007-unified-identity/drop-role-0022.sql`.
- [x] T048 [US4] Run the complete after-suite on schema 0021 and block migration 0022 unless every inventoried allow/deny case passes and results match the committed baseline expectations in `tests/security/007-unified-identity/harness.ts`.
- [x] T049 [US4] Drop `profiles.role`, `private_user_roles`, the role enum, role sync/protection/signup triggers and functions, `private.is_admin`, `private.is_student`, and `get_my_role` in `supabase/migrations/0022_drop_fixed_roles.sql` only after T048 is checked; remove the role-update guard trigger/function and role-specific protections introduced by `0020_profiles_role_update_guard.sql` while preserving safe profile updates.
- [x] T050 [US4] Run the same complete after-suite after migration 0022 and save results in `specs/007-unified-identity/security-baseline/after/`; require identical expected allow/deny decisions in `tests/security/007-unified-identity/harness.ts`.
- [x] T051 [US4] Scan the final database catalog and source for role columns/helpers/grants, active policy/function/trigger/Edge dependencies, and SECURITY DEFINER search paths; record the zero-dependency report in `specs/007-unified-identity/security-baseline/after/catalog.md`.
- [x] T052 [US4] Commit `supabase/migrations/0022_drop_fixed_roles.sql`, its tests, final catalog report and after-suite evidence as the last database authorization change.

## Follow-ups After 0022

- [ ] T073 Rename the legacy Supabase `project_id` (`05_Testo` in `supabase/config.toml`) to the approved Manjam project identifier after 0022; update any deployment/local-link references in the same change.
- [ ] T074 After 0022 and final evidence capture, clean up obsolete local security fixture data and temporary database artifacts; preserve the frozen `before/` baseline and committed reports.
- [ ] T075 After 0022, refactor shared Edge authorization and test infrastructure: add `withAuth`, add optional `callOperation` options, centralize `denial_reason` constants, and introduce typed test helpers. Preserve behavior with focused coverage before removing duplicate patterns.

---

## Dependencies and Parallel Execution

### Hard gates and phase order

- **T001 → T002 → T003 → T004–T006 → T007 → T008**: harness first, then fixtures, inventory, before tests, baseline run, and committed evidence. No migration or UI work may begin until T008 is checked and its commit hash is recorded.
- **0014 → 0015 → 0016 → 0017 → 0018**: each migration depends on the prior migration phase's passing matrix, catalog scan and commit.
- **0018 → 0019 → UI phase → 0020 → 0021 → 0022**: the owner-returning fix follows the cutover; lookup timing is fixed before the UI phase; the local profile role guard follows the UI phase; owner-field updates precede dropping `admin_id`; the final role drop follows the 0021 after-suite.
- **0022 → T073–T075**: project identifier rename, local database cleanup and shared Edge/test refactor follow final role removal.
- **T027 → T038**: T038 depends on T027 because both edit `src/app/admin/groups/[groupId]/page.tsx`.
- Within every migration phase, test-writing tasks precede migration edits; run before/after matrix and catalog scan before its commit task.
- **Coupled 0017 group**: T024–T033 must be reviewed and landed together; none may be separately deployed from the others.

### Parallel opportunities

- After T003 freezes the inventory, T004, T005 and T006 can be authored in parallel because they cover separate RLS, SQL RPC/trigger, and Edge test files. T007 waits for all three.
- Within Phase 0017, T024, T025 and T026 can be authored in parallel after Phase 0016; T027 and T028 can be developed after their tests are written. T029 must complete before T030 because both edit `0017_unified_authorization_cutover.sql`; T032 reruns the audit after T030. All changes must be integrated and committed as one cutover group.
- UI translation work T040 can proceed in parallel with route work T037–T039 after 0017; final UI verification T041 waits for all UI tasks.
- No migration phases can run in parallel. Phases 0018, 0019, 0020, 0021 and 0022 are sequential gates.

## Independent Test Criteria by User Story

- **US1 — Learn and teach with one account**: one account can own resources and participate elsewhere; unauthorized ownership, group membership or exam participation is denied; owner self-join/self-exam remain denied; group join occurs only through a valid invitation.
- **US2 — Scoped profile data**: own profile is readable; owners see only name+email for current group members or exam-linked members/attempt holders; lookup returns id+name only for an already-associated exact match; unrelated/nonexistent lookup responses are indistinguishable.
- **US3 — Unified dashboard**: Learning and Teaching sections show only membership and ownership data, respectively, with localized empty/error states, working authorized destinations, EN/AR RTL and light/dark layouts.
- **US4 — Preserve authorization**: each frozen inventory path has recorded allow and deny cases before and after; no anonymous or unrelated access appears; question delivery excludes answers; all security-definer and grant audits pass.

## MVP and Implementation Strategy

This feature has a mandatory security baseline gate, so no implementation MVP can start before T008. The first implementation increment is the 0014–0016 additive bridge; the decisive authorization cutover is the single coupled 0017 group. Migration 0018 fixes owner INSERT ... RETURNING visibility found by the after-0017 matrix. Migration 0019 scopes lookup timing to context members. The dashboard consolidation follows 0018 and precedes owner-column cleanup in 0021, after the local profile role guard in 0020. A release is complete only after the full post-0022 suite, catalog scan, UI visual review and committed evidence pass.

## Notes

- Every implementation task is blocked by the Phase 0 baseline gate.
- `[P]` means separate files and no dependency on an incomplete task; migration phases themselves are sequential.
- Pre-existing uncommitted UI edits listed above must be preserved; T035 and T036 are the only planned tasks that touch the already-dirty dashboard/shell files.
- Before-results must be committed before any local database reset/reseed. After fixtures are regenerated from the deterministic manifest and equivalence is asserted by stable IDs, edges, counts, case decisions and manifest hash.
- Void-attempt and grade-override are not implemented in the current codebase; 007 only tests their absence (T005). When built later in feature 004, they must be owner-only with non-owner denial tests (FR-015).
- Between 0017 and the UI phase, role-based route guards still exist, so accounts without the old admin role cannot yet reach `/admin` pages; this is accepted because this is local development with no real users.
